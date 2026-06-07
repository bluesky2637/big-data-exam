(() => {
  const paper = JSON.parse(document.querySelector('#exam-data').textContent);
  const hasAnswers = Boolean(paper.has_answers);
  const questionsRoot = document.querySelector('#questions');
  const grid = document.querySelector('#question-grid');
  const form = document.querySelector('#exam-form');
  const timer = document.querySelector('#timer');
  const storageStatus = document.querySelector('#storage-status');
  const sidebar = document.querySelector('#question-sidebar');

  const examStorageKey = `offline-exam:${paper.id}:v1`;
  const practiceStorageKey = `offline-practice:${paper.id}:v3`;
  const oldPracticeStorageKey = `offline-practice:${paper.id}:v2`;
  const olderPracticeStorageKey = `offline-practice:${paper.id}:v1`;
  const modeStorageKey = `offline-mode:${paper.id}:v1`;

  let mode = 'exam';
  let examElapsed = 0;
  let submitted = false;
  let tickHandle = null;
  let canStore = true;
  let wrongOnly = false;
  let examAnswers = {};
  let practice = emptyPracticeState();

  function $(selector, root = document) { return root.querySelector(selector); }
  function $all(selector, root = document) { return [...root.querySelectorAll(selector)]; }

  function emptyPracticeState() {
    return {
      version: 3,
      paperId: paper.id,
      savedAt: null,
      elapsed: 0,
      answers: {},
      firstResults: {},
      attempts: {},
      latestResults: {},
      revealed: {},
      history: {},
    };
  }

  function escapeHtml(value) {
    const node = document.createElement('span');
    node.textContent = value || '';
    return node.innerHTML;
  }

  function textFromHtml(value) {
    const node = document.createElement('div');
    node.innerHTML = value || '';
    return node.textContent.replace(/\s+/g, ' ').trim();
  }

  function stemText(question) {
    return textFromHtml(question.stem_html || '');
  }

  function optionText(option) {
    return textFromHtml(option.html || option.text || '');
  }

  function correctLabels(question) {
    return question.reference?.answer || [];
  }

  function answerLabel(question) {
    const values = correctLabels(question);
    if (['单选题', '多选题', '判断题'].includes(question.type)) return values.join('、');
    if (question.type === '填空题') return values.map((v, i) => `第 ${i + 1} 空：${v}`).join('；');
    return values.join('；');
  }

  function correctOptions(question) {
    const labels = new Set(correctLabels(question));
    return (question.options || []).filter((option) => labels.has(option.label));
  }

  function wrongOptions(question) {
    const labels = new Set(correctLabels(question));
    return (question.options || []).filter((option) => !labels.has(option.label));
  }

  function correctOptionText(question) {
    const options = correctOptions(question);
    if (!options.length) return answerLabel(question);
    return options.map((option) => `${option.label}. ${optionText(option)}`).join('；');
  }

  function questionSearchText(question) {
    return [
      stemText(question),
      ...(question.options || []).map((option) => optionText(option)),
      correctOptionText(question),
      question.reference?.explanation || '',
      question.reference?.source || '',
    ].join(' ');
  }

  function isTrueFalseQuestion(question) {
    return question.type === '判断题';
  }

  function truthWord(question) {
    if (!isTrueFalseQuestion(question)) return '';
    return correctLabels(question)[0] === 'A' ? '对' : '错';
  }

  function genericChoiceExplanation(question) {
    const right = correctOptionText(question);
    const wrong = wrongOptions(question).slice(0, 3).map((option) => `${option.label}. ${optionText(option)}`).join('；');
    if (question.type === '多选题') {
      return `这题是多选，不能只记一个答案。正确项是 ${escapeHtml(right)}。做这类题要先看每个选项是不是属于同一类知识点，凡是不符合定义、说得太绝对、或者把别的概念混进来的选项都不能选。${wrong ? `容易混淆的是：${escapeHtml(wrong)}，这些不是本题要的完整答案。` : ''}`;
    }
    if (question.type === '单选题') {
      return `这题要抓住题干中的关键词，再和选项的概念对应起来。正确答案是 ${escapeHtml(right)}，因为它和题干描述的概念最匹配。${wrong ? `其他选项属于干扰项：${escapeHtml(wrong)}。` : ''}`;
    }
    if (question.type === '填空题') {
      return `这题是概念填空，答案必须写准关键词。这里应填 ${escapeHtml(answerLabel(question))}。背的时候不要只背句子，要把“题干描述”和“这个关键词”绑定起来。`;
    }
    return question.reference?.explanation ? escapeHtml(question.reference.explanation) : '这题要先写出核心概念，再结合题干说明原因。';
  }

  function explanationRules(question) {
    const text = questionSearchText(question);
    const stem = stemText(question);
    const ans = answerLabel(question);
    const right = correctOptionText(question);
    const tf = truthWord(question);

    const rules = [
      [/NameNode.*单点故障|单点故障.*NameNode/, () => `这句话是${tf}的。NameNode 不是用来存真正的数据块，而是保存 HDFS 的目录结构、文件名、权限、以及“每个文件的数据块放在哪些 DataNode 上”等元数据信息。早期或基础 HDFS 架构中，NameNode 如果出故障，客户端就不知道文件该去哪里找，即使 DataNode 上的数据还在，整个文件系统也很难正常访问，所以说它是单点故障。记住：DataNode 坏一台还有副本，NameNode 出问题会影响全局元数据。`],
      [/HDFS.*大量小文件|大量小文件.*HDFS|小文件/, () => `这句话是${tf}的。HDFS 更适合存大文件，不适合存大量小文件。原因是每个文件、每个数据块的元数据都要由 NameNode 管理，小文件太多会让 NameNode 保存大量元数据，内存压力变大，查询效率也会下降。记住：HDFS 怕的不是“大文件”，怕的是“小文件数量太多”。`],
      [/HDFS.*低延迟|低延迟.*HDFS/, () => `这题的关键是“低延迟”。HDFS 设计目标是高吞吐量地读写大规模数据，适合批处理和大文件顺序读写，不适合毫秒级、频繁随机访问的小请求。所以如果题目说 HDFS 适合低延迟访问，一般是错的；如果问 HDFS 的局限性，低延迟通常就是它不擅长的点。`],
      [/HDFS.*默认大小|默认大小.*HDFS|128MB|64MB|256MB|512MB/, () => `HDFS 文件会被切成数据块保存，常考默认块大小是 128MB。数据块设计得比较大，是为了减少寻址开销，提高大文件顺序读写效率。64MB 常作为旧版本或干扰项出现，考试里看到 HDFS 默认块大小通常优先记 128MB。`],
      [/HDFS.*块|文件被分割|固定大小/, () => `HDFS 存文件时，不是把整个文件原封不动放在一台机器上，而是切成多个固定大小的数据块，再分散存到不同 DataNode 上。这样既能保存超大文件，也能通过副本机制提高可靠性。所以题干问“文件被分割成什么”，答案就是“块”。`],
      [/NameNode.*DataNode|DataNode.*NameNode|主从架构|HDFS 集群/, () => `HDFS 是典型主从架构。NameNode 负责管理元数据，比如文件目录、数据块位置；DataNode 负责真正存储数据块并定期向 NameNode 汇报状态。理解成一句话：NameNode 是“管账本的”，DataNode 是“放货物的”。`],
      [/SecondaryNameNode/, () => `SecondaryNameNode 很容易被误解成 NameNode 的备用机，但它不是热备。它主要负责定期帮助 NameNode 合并 fsimage 和 edits 编辑日志，减轻 NameNode 重启时加载日志的压力。所以看到 SecondaryNameNode，优先想“合并日志”，不要想“替代 NameNode 工作”。`],
      [/GFS/, () => `GFS 是 Google File System，是 Google 提出的分布式文件系统思想。HDFS 很多设计思想都借鉴了 GFS，比如把大文件切块、分布式存储、多副本容错。题目问 Google 的分布式文件系统，答案就是 GFS。`],

      [/HBase.*时间戳|时间戳.*HBase|数据版本/, () => `HBase 中同一个单元格可以保存多个版本的数据，版本靠时间戳区分。也就是说，行键和列能定位到一个单元格，而时间戳能说明这是这个单元格在什么时间写入的版本。记住：HBase 多版本 = 时间戳。`],
      [/HBase.*行键|行键.*HBase|唯一标识一行/, () => `HBase 里一行数据靠行键 RowKey 唯一标识。你可以把 RowKey 理解成这一行的“身份证号”，查数据、定位数据时都会先看它。列族、列限定符、时间戳都是进一步定位单元格或版本的，不是唯一标识一行的。`],
      [/HBase.*单元格|最小存储单元/, () => `HBase 的数据定位可以理解为：行键 + 列族 + 列限定符 + 时间戳，最终定位到一个单元格。单元格才是存放具体值的最小单位。记忆顺序：先找行，再找列，最后找到具体格子。`],
      [/HBase.*列族|列族.*HBase|列限定符/, () => `HBase 的列不是随便散着放的，而是先归到列族里。列族下面才有具体的列限定符。列族一般在建表时确定，列限定符可以更灵活地扩展。记住：列族是大类，列限定符是大类下面的具体字段。`],
      [/HBase.*HDFS|构建在.*HDFS/, () => `HBase 是分布式数据库，但它底层通常依赖 HDFS 来保存数据文件。HDFS 负责分布式存储和副本容错，HBase 在上面提供按行键快速读写的能力。所以问 HBase 构建在哪个系统之上，答案是 HDFS。`],

      [/Shuffle/, () => `Shuffle 是 MapReduce 中最容易考的位置题。Map 阶段先输出中间键值对，Reduce 阶段要把相同 key 的数据汇总处理。Shuffle 就是在 Map 和 Reduce 之间负责分组、排序、传输这些中间结果的过程。记住：Shuffle 是 Map 到 Reduce 的“中转站”。`],
      [/MapReduce.*磁盘|中间结果.*磁盘|延迟较高/, () => `这句话是${tf}的。MapReduce 的中间结果通常要写入磁盘，再经过 Shuffle 传给 Reduce，这会带来较大的磁盘 I/O 开销，所以延迟比较高。它适合离线批处理，不适合对实时性要求很高的场景。`],
      [/MapReduce.*迭代|不适合迭代|适合迭代/, () => `MapReduce 不适合迭代计算。因为每一轮计算的中间结果往往要落盘，下一轮又要重新读取，磁盘 I/O 成本很高。像机器学习这种需要反复迭代的任务，一般 Spark 会更合适。`],
      [/MapReduce.*核心思想|计算向数据靠拢|数据向计算靠拢/, () => `MapReduce 的核心思想是“计算向数据靠拢”。数据量太大时，把数据搬到计算节点代价很高，所以更合理的做法是把计算任务分发到数据所在的节点附近执行。记住：大数据场景里，移动程序比移动数据更划算。`],
      [/Map.*输入.*键值对|Map 函数的输入/, () => `MapReduce 中 Map 函数处理的数据形式通常是键值对。Map 把输入数据转成中间键值对，Reduce 再把相同 key 的值合并处理。看到 Map/Reduce，脑子里就要有 key-value 这个结构。`],
      [/JobTracker|TaskTracker/, () => `在经典 Hadoop MapReduce 架构中，JobTracker 负责任务调度和整体作业管理，TaskTracker 负责在具体节点上执行任务。记忆：JobTracker 管“整个作业”，TaskTracker 跑“具体任务”。`],
      [/任务重试|容错机制/, () => `MapReduce 的任务可能会因为节点故障或运行错误失败，所以它的容错机制常通过任务重试实现。某个任务失败后，系统可以把它重新调度到其他节点再执行。记住：MapReduce 容错常考“任务重试”。`],
      [/批处理.*MapReduce|MapReduce.*批处理/, () => `MapReduce 是典型批处理计算框架。批处理的特点是一次性处理一批历史数据，适合离线统计、日志分析、报表计算等任务。它不是实时流处理框架，所以不要和 Flink、Storm 混淆。`],

      [/RDD/, () => `RDD 是 Spark 的核心数据抽象，可以理解成分布在多台机器上的只读数据集合。它支持分区、容错和并行计算。Spark 之所以比 MapReduce 更适合迭代任务，一个重要原因就是中间结果可以缓存在内存中。记住：Spark 核心抽象 = RDD。`],
      [/Spark Core/, () => `Spark Core 是整个 Spark 生态的底层核心，负责任务调度、内存计算、容错等基础能力。Spark SQL、Spark Streaming、MLlib、GraphX 都是在 Spark Core 基础上构建的。记住：Core 是底座。`],
      [/Spark.*中间结果|保存在内存|速度更快/, () => `这句话是${tf}的。Spark 的优势之一是可以把中间结果缓存在内存中，减少反复读写磁盘的开销，所以在迭代计算、交互式分析等场景中通常比 MapReduce 更快。`],
      [/GraphX/, () => `GraphX 是 Spark 生态里用于图计算的组件。图计算处理的是点和边的关系，比如社交网络、网页链接、关系路径分析。看到 Spark + 图计算，答案一般就是 GraphX。`],
      [/MLlib/, () => `MLlib 是 Spark 的机器学习库，提供分类、回归、聚类、推荐等算法。看到 Spark 生态里和机器学习相关的组件，就想到 MLlib。`],
      [/Spark SQL|DataFrame|Structured Streaming/, () => `Spark SQL 主要处理结构化和半结构化数据，支持 SQL 查询和 DataFrame API。Structured Streaming 的重要改进是用 DataFrame/Dataset 这套统一 API 来处理流数据，让批处理和流处理的编程模型更统一。`],
      [/Spark Streaming/, () => `Spark Streaming 是 Spark 生态中的流处理组件，但它本质上偏微批处理，也就是把连续数据切成一小批一小批来处理。真正低延迟、事件驱动的流处理题里，Flink 往往更常作为答案。`],
      [/Spark.*YARN|YARN.*Spark/, () => `Spark 可以运行在多种资源管理环境上，包括 Local、Standalone、YARN 等。YARN 是 Hadoop 生态里的资源调度系统，Spark 运行在 YARN 上很常见。`],
      [/伯克利|AMP/, () => `Spark 最早由加州大学伯克利分校 AMP 实验室开发，后来成为 Apache 顶级项目。考试问 Spark 起源时，记住“伯克利 AMP 实验室”。`],

      [/Flink.*批处理.*流处理|同时支持批处理和流处理/, () => `这句话是${tf}的。Flink 的特点是以流处理为核心，同时也支持批处理。它更强调低延迟、高吞吐和事件时间语义。记住：Flink 不是只能流处理，而是流批都支持。`],
      [/Flink.*低延迟|毫秒级|高吞吐|事件时间/, () => `Flink 常考关键词是低延迟、高吞吐、事件时间语义。它适合实时日志、实时风控、实时指标计算等场景。和 Spark Streaming 的微批思想相比，Flink 更偏真正的流式处理。`],
      [/Flink.*行级实时|计算模型/, () => `Flink 的流处理更接近逐条事件的实时处理，而不是把数据攒成大批再处理。题目里如果出现“行级实时处理”或“毫秒级延迟”，一般是在强调 Flink 的流处理特征。`],
      [/Storm/, () => `Storm 是较早的实时流计算框架，主要用于持续不断的数据流处理。它和 Flink 都属于流计算代表，和 MapReduce 这种离线批处理不是一类。`],

      [/MongoDB/, () => `MongoDB 是文档型 NoSQL 数据库，常用 JSON/BSON 形式保存数据。它不是关系数据库，因为它不是用固定二维表和 SQL 关系模型作为核心。考试里看到 MongoDB，优先想到“文档数据库、NoSQL”。`],
      [/Redis/, () => `Redis 是键值数据库，常用来做缓存、会话存储、排行榜等高性能读写场景。它不是关系数据库，也不是文档数据库。记住：Redis = key-value = 缓存常客。`],
      [/Neo4j/, () => `Neo4j 是图数据库，擅长处理节点和关系，比如社交网络好友关系、推荐关系、路径分析。题目里出现“社交网络关系分析”“图计算模式代表产品”，Neo4j 很容易成为答案。`],
      [/Cassandra/, () => `Cassandra 是列族数据库的典型代表，适合大规模分布式存储和高可用场景。它属于 NoSQL，不是传统关系数据库。记住：Cassandra/HBase 常和列族数据库联系在一起。`],
      [/NoSQL.*ACID|严格的 ACID|都不支持 ACID/, () => `NoSQL 通常为了扩展性和灵活性，会弱化传统关系数据库那种严格 ACID 事务，但不能说所有 NoSQL 都完全不支持事务。题目里出现“都”“完全”“一定”这种绝对说法，要特别小心。`],
      [/NoSQL.*海量数据|高并发|水平扩展|灵活的数据模型/, () => `NoSQL 出现的主要原因，是传统关系数据库在海量数据、高并发和灵活扩展方面遇到压力。NoSQL 的优势是数据模型灵活、水平扩展能力强，适合互联网大规模数据场景。`],
      [/关系数据库|SQL Server|DB2|Oracle|MySQL|关系模型|SQL 查询|主键/, () => `关系数据库的核心是关系模型，也就是用表、行、列来组织数据，通常支持 SQL 查询和 ACID 事务。SQL Server、DB2、Oracle、MySQL 都是典型关系数据库；MongoDB、Redis、Neo4j 这类一般归到 NoSQL。`],

      [/数据仓库.*面向主题|面向主题.*数据仓库|集成.*相对稳定|历史变化/, () => `数据仓库不是用来处理日常交易的，而是把多个业务系统的历史数据整理起来支持分析和决策。它的四个典型特征是：面向主题、集成、相对稳定、反映历史变化。记忆：主题、集成、稳定、历史。`],
      [/数据仓库.*管理决策|管理决策.*数据仓库|OLAP/, () => `数据仓库主要服务分析和管理决策，不是服务在线交易。数据库更偏 OLTP，比如下单、支付、修改库存；数据仓库更偏 OLAP，比如统计销售趋势、分析用户行为。`],
      [/数据仓库.*实时交易|在线事务|频繁更新|批量更新/, () => `数据仓库的数据通常来自历史业务数据，更新方式多为批量加载，不强调实时频繁修改。它追求的是稳定的分析环境，而不是像普通数据库那样处理大量实时交易。`],

      [/数据湖.*结构化|半结构化|非结构化|所有类型|原始数据/, () => `数据湖的特点是“先把数据放进来”，可以存结构化、半结构化和非结构化数据，也可以保存原始数据和处理后的数据。它比数据仓库更灵活，但如果缺少治理，也容易变成混乱的数据沼泽。`],
      [/数据湖.*对象存储|存储底座/, () => `数据湖的底座通常是对象存储或分布式存储，因为它要低成本地存放大量不同类型的数据。对象存储适合海量、弹性、低成本的数据保存，所以常作为数据湖基础。`],
      [/湖仓一体|数据湖和数据仓库/, () => `湖仓一体不是简单把数据湖和数据仓库放在一起，而是打通两者的数据和元数据，让数据既能灵活存储，又能支持高质量分析。记住：湖负责灵活存，仓负责高质量分析，湖仓一体强调打通。`],

      [/IaaS|PaaS|SaaS|云计算的三种服务模式/, () => `云计算常见三种服务模式是 IaaS、PaaS、SaaS。IaaS 提供基础设施，PaaS 提供开发运行平台，SaaS 直接提供软件服务。题目里出现“aaS”这种不完整写法，一般是干扰项。`],
      [/云数据库.*硬件|自行维护|按需付费|高可用|多租|多副本/, () => `云数据库的核心优势是不用用户自己维护底层硬件，可以按需付费、弹性扩展，并通过多副本等机制提高可用性。多租表示多个用户共享云平台资源，但彼此逻辑隔离。`],
      [/云计算.*大数据|大数据.*云计算/, () => `云计算和大数据的关系可以理解为：云计算提供算力和存储，大数据使用这些资源来保存、处理和分析海量数据。不是大数据提供云计算基础设施，而是云计算支撑大数据应用。`],

      [/折线图/, () => `折线图适合看数据随时间变化的趋势，比如访问量每天变化、销售额按月变化。只要题干出现“趋势”“随时间变化”，优先想到折线图。`],
      [/饼图/, () => `饼图适合展示部分与整体的占比关系，比如不同类别占总量的百分比。它不适合比较很多类别，也不适合看时间趋势。`],
      [/散点图/, () => `散点图适合看两个变量之间有没有关系，比如身高和体重、广告费用和销售额。题目里出现“两个变量相关性”，一般选散点图。`],
      [/柱状图/, () => `柱状图适合比较不同类别之间的数量大小，比如各地区销量、各专业人数。它强调“类别之间谁多谁少”。`],
      [/漏斗图/, () => `漏斗图适合展示转化流程，比如浏览商品、加入购物车、提交订单、支付成功。越往下人数越少，像漏斗一样，所以叫漏斗图。`],
      [/桑基图/, () => `桑基图适合展示数据、能量、资金等从哪里流向哪里，重点是“流动关系”。如果题干出现“流向”“转移”“能量流”“数据流”，优先想到桑基图。`],
      [/热力图/, () => `热力图用颜色深浅表示数值大小或密集程度，适合看热点、密度、地理分布等。题目里出现“地理分布”“热点分布”，热力图经常是答案。`],
      [/词云图/, () => `词云图适合展示文本中关键词出现频率。词越大，通常代表出现次数越多。题干出现“文本关键词频率”，优先想到词云图。`],
      [/雷达图/, () => `雷达图适合比较多个维度的综合表现，比如一个产品在价格、性能、口碑、服务等多个指标上的情况。题目里出现“三个以上维度”，可以想到雷达图。`],
      [/玫瑰图|鸡冠花图|南丁格尔/, () => `南丁格尔的“鸡冠花图”本质上属于玫瑰图，用扇区面积或半径表现不同类别数据。考试里看到南丁格尔、鸡冠花图，就记玫瑰图。`],
      [/Gephi/, () => `Gephi 主要用于网络关系和图数据可视化，比如社交关系、节点连接关系。它不是主要用来做普通地理地图的工具。`],
      [/ECharts|D3|Tableau|Power BI|大数据魔镜/, () => `这些都是可视化相关工具，但定位不同。ECharts 和 D3 偏开源图表库，Tableau 和 Power BI 偏商业智能分析工具，大数据魔镜属于国产可视化工具。`],

      [/监督学习|无监督学习|K-Means|DBSCAN|层次聚类|聚类/, () => `聚类属于无监督学习，因为它不需要提前给数据贴好类别标签，而是让算法自己根据相似性把数据分组。K-Means、DBSCAN、层次聚类都是常见聚类算法。记住：用户分群常用聚类。`],
      [/决策树|朴素贝叶斯|支持向量机|分类算法|分类/, () => `分类是监督学习，目标是预测一个类别标签，比如垃圾邮件/正常邮件、流失/不流失。决策树、朴素贝叶斯、支持向量机都是常见分类算法。`],
      [/线性回归|回归分析|房价预测|销售额预测/, () => `回归分析预测的是连续数值，比如房价、温度、销售额。它和分类不同，分类预测类别，回归预测数值。看到“预测金额、价格、销量数值”，优先想到回归。`],
      [/主成分分析|PCA/, () => `主成分分析用于降维，目的是用更少的综合变量保留主要信息。它通常属于无监督学习，因为不依赖人工标注的类别标签。`],
      [/支持向量机|最大间隔|超平面/, () => `支持向量机的核心思想是找到一个分类超平面，让不同类别之间的间隔尽可能大。关键词是“最大间隔超平面”。`],
      [/Scikit-learn/, () => `Scikit-learn 是 Python 里常用的机器学习库，包含分类、回归、聚类、降维等算法。NumPy、Pandas、Matplotlib 也常用，但它们分别更偏数值计算、数据处理、绘图。`],

      [/协同过滤|UserCF|ItemCF|物以类聚|人以群分|ALS/, () => `协同过滤要分清两句话：“人以群分”对应基于用户的协同过滤 UserCF，意思是找兴趣相似的人；“物以类聚”对应基于物品的协同过滤 ItemCF，意思是找相似物品。ALS 矩阵分解属于基于模型的协同过滤。`],
      [/Apriori|FP-Growth|关联规则|支持度|置信度|可信度|提升度|购物篮/, () => `关联规则挖掘常用于购物篮分析，研究“买了 X 的人是否也会买 Y”。支持度看规则出现得多不多，置信度看买 X 后同时买 Y 的比例高不高。Apriori 和 FP-Growth 都是关联规则算法，其中 FP-Growth 的优势是不需要生成大量候选集。`],

      [/数据清洗|缺失值|重复数据|异常值/, () => `数据预处理通常先做数据清洗，因为原始数据可能有缺失值、重复值、异常值和错误数据。清洗的目的就是先把脏数据处理掉，再进行集成、转换、规约和分析。`],
      [/数据集成|合并多个数据源/, () => `数据集成是把多个来源的数据合并到一起，比如把订单系统、用户系统、日志系统的数据统一起来。重点是“多个数据源合并”。`],
      [/数据标准化|数据转换/, () => `数据标准化属于数据转换，它把不同量纲、不同范围的数据变到统一尺度，方便后续建模和分析。看到标准化、归一化，优先想到数据转换。`],
      [/数据离散化|数据规约|采样/, () => `数据规约的目的是在尽量保留主要信息的前提下减少数据规模或复杂度。采样、降维、离散化等都可能和规约相关。离散化就是把连续值划分成若干区间。`],
      [/分箱|等宽|等深|等频/, () => `分箱就是把连续数据按规则分成几个区间。等宽分箱要求每个区间宽度相同；等深/等频分箱要求每个箱子里的数据个数尽量相同。记住：等宽看区间长度，等深看数据个数。`],

      [/Volume|Velocity|Variety|Value|Veracity|4V|大数据.*特征/, () => `大数据常考 4V/5V。Volume 是数据量大，Velocity 是产生和处理速度快，Variety 是数据类型多样，Value 是价值密度低但总价值高，Veracity 强调真实性和可信度。做题时直接把英文词和中文含义绑定。`],
      [/查询分析计算|流计算|批处理计算|图计算|计算模式/, () => `大数据处理不是只有一种模式。批处理适合离线处理历史数据，流计算适合实时数据，查询分析适合快速统计和分析，图计算适合关系网络和路径分析。所以“查、流、批、图”都属于常见大数据计算模式。`],
    ];

    const matched = rules.find(([pattern]) => pattern.test(text));
    if (matched) return matched[1]();
    return genericChoiceExplanation(question);
  }

  function explain(question) {
    const raw = explanationRules(question);
    return raw.replace(/\s+/g, ' ').trim();
  }

  function renderControl(question) {
    const name = `q-${question.number}`;
    if (question.type === '单选题' || question.type === '判断题') {
      return `<div class="option-list">${question.options.map((option) => `
        <label class="option-row" data-option="${option.label}">
          <input type="radio" name="${name}" value="${option.label}">
          <span class="option-letter">${option.label}</span>
          <span class="option-text">${option.html || escapeHtml(option.text)}</span>
        </label>`).join('')}</div>`;
    }
    if (question.type === '多选题') {
      return `<div class="option-list">${question.options.map((option) => `
        <label class="option-row" data-option="${option.label}">
          <input type="checkbox" name="${name}" value="${option.label}">
          <span class="option-letter">${option.label}</span>
          <span class="option-text">${option.html || escapeHtml(option.text)}</span>
        </label>`).join('')}</div>`;
    }
    if (question.type === '填空题') {
      const count = Math.max(question.blank_count, 1);
      return `<div class="blank-list">${Array.from({ length: count }, (_, index) => `
        <label class="blank-row">
          <span>第 ${index + 1} 空</span>
          <input type="text" name="${name}-${index + 1}" data-question="${question.number}" placeholder="请输入答案">
        </label>`).join('')}</div>`;
    }
    return `<label class="essay-box"><span>作答区</span><textarea name="${name}" rows="7" placeholder="在此输入你的回答"></textarea></label>`;
  }

  function renderReference(question) {
    if (!question.reference) return '';
    const isObjective = ['单选题', '多选题', '判断题', '填空题'].includes(question.type);
    const points = isObjective
      ? `<p class="reference-answer"><strong>参考答案</strong><span>${escapeHtml(answerLabel(question))}</span></p>`
      : `<ol>${question.reference.answer.map((point) => `<li>${escapeHtml(point)}</li>`).join('')}</ol>`;
    const confirmButton = ['多选题', '填空题'].includes(question.type)
      ? `<button class="button button-primary confirm-answer" type="button" data-confirm="${question.number}">确认答案</button>`
      : '';
    const selfGrade = isObjective ? '' : `<div class="self-grade" data-self-grade="${question.number}" hidden>
      <span>对照后自评：</span>
      <button class="button button-primary self-grade-button" type="button" data-grade="correct">会做</button>
      <button class="button button-danger self-grade-button" type="button" data-grade="wrong">不会</button>
    </div>`;

    return `
      <div class="practice-question-actions">
        ${confirmButton}
        <button class="button button-quiet reveal-answer" type="button" data-reveal="${question.number}">查看参考答案</button>
      </div>
      <section class="feedback-panel" data-feedback="${question.number}" hidden aria-live="polite">
        <div class="feedback-verdict" data-verdict="${question.number}">参考答案</div>
        ${points}
        <p class="reference-explanation"><strong>解析：</strong>${escapeHtml(explain(question))}</p>
        <footer>
          <span>看懂版解析</span>
          <span class="basis-badge">不用翻书</span>
        </footer>
      </section>
      ${selfGrade}`;
  }

  function renderQuestions() {
    questionsRoot.innerHTML = paper.questions.map((question) => `
      <article class="question-card" id="question-${question.number}" data-question="${question.number}" data-type="${question.type}">
        <header class="question-header">
          <div class="question-number">${String(question.number).padStart(2, '0')}</div>
          <div><span class="question-type">${question.type}</span><span class="question-score">${question.score} 分</span></div>
          <button class="mark-button" type="button" aria-label="标记第 ${question.number} 题" title="标记稍后检查">◇</button>
        </header>
        <div class="question-stem">${question.stem_html}</div>
        ${question.missing_images ? `<p class="question-source-warning">这道题有 ${question.missing_images} 处图片在原始 HTML 中已经缺失。</p>` : ''}
        <div class="answer-area">${renderControl(question)}</div>
        ${renderReference(question)}
      </article>`).join('');

    if (hasAnswers) {
      questionsRoot.insertAdjacentHTML('beforeend', `
        <section class="practice-empty" id="practice-empty" hidden>
          <span class="eyebrow">错题已清空</span>
          <h2>这一轮没有待复习的错题</h2>
          <p>返回整套刷题继续练习，新的错题会自动加入错题记录。</p>
          <button class="button button-primary" id="return-all-questions" type="button">返回整套刷题</button>
        </section>`);
    }

    grid.innerHTML = paper.questions.map((question) => `<a href="#question-${question.number}" data-nav="${question.number}" title="第 ${question.number} 题">${question.number}</a>`).join('');
  }

  function formatTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
  }

  function collectAnswers() {
    const answers = {};
    paper.questions.forEach((question) => {
      const name = `q-${question.number}`;
      if (question.type === '多选题') answers[question.number] = $all(`input[name="${name}"]:checked`, form).map((input) => input.value);
      else if (question.type === '填空题') answers[question.number] = $all(`input[data-question="${question.number}"]`, form).map((input) => input.value);
      else if (question.type === '单选题' || question.type === '判断题') answers[question.number] = $(`input[name="${name}"]:checked`, form)?.value || '';
      else answers[question.number] = $(`[name="${name}"]`, form)?.value || '';
    });
    return answers;
  }

  function isAnswered(question, value) {
    if (question.type === '填空题') return Array.isArray(value) && value.length >= question.blank_count && value.every((item) => String(item).trim());
    if (Array.isArray(value)) return value.some((item) => String(item).trim());
    return Boolean(String(value || '').trim());
  }

  function clearForm() {
    form.reset();
    $all('.question-card', form).forEach((card) => card.classList.remove('answered', 'practice-correct-state', 'practice-wrong-state'));
    $all('.option-row', form).forEach((row) => row.classList.remove('correct-option', 'wrong-option'));
    $all('.feedback-panel', form).forEach((panel) => { panel.hidden = true; });
    $all('.self-grade', form).forEach((panel) => { panel.hidden = true; });
  }

  function applyAnswers(answers = {}) {
    clearForm();
    paper.questions.forEach((question) => {
      const name = `q-${question.number}`;
      const value = answers[question.number];
      if (question.type === '多选题') {
        const selected = Array.isArray(value) ? value : [];
        $all(`input[name="${name}"]`, form).forEach((input) => { input.checked = selected.includes(input.value); });
      } else if (question.type === '填空题') {
        const values = Array.isArray(value) ? value : [];
        $all(`input[data-question="${question.number}"]`, form).forEach((input, index) => { input.value = values[index] || ''; });
      } else if (question.type === '单选题' || question.type === '判断题') {
        $all(`input[name="${name}"]`, form).forEach((input) => { input.checked = input.value === value; });
      } else {
        const input = $(`[name="${name}"]`, form);
        if (input) input.value = value || '';
      }
    });
  }

  function examProgress() {
    if (mode === 'exam') examAnswers = collectAnswers();
    const answered = paper.questions.filter((question) => isAnswered(question, examAnswers[question.number])).length;
    return { answers: examAnswers, answered, unanswered: paper.question_count - answered };
  }

  function hasFirstResult(number) {
    return Object.prototype.hasOwnProperty.call(practice.firstResults, number);
  }

  function activeWrongCount() {
    return paper.questions.filter((question) => {
      const record = practice.history[question.number];
      return record?.wrong && !record?.mastered;
    }).length;
  }

  function practiceQuestionNumbers() {
    if (!wrongOnly) return paper.questions.map((question) => question.number);
    return paper.questions.map((question) => question.number).filter((number) => {
      const record = practice.history[number];
      return record?.wrong && !record?.mastered;
    });
  }

  function practiceProgress() {
    const completed = Object.keys(practice.firstResults).length;
    const correct = Object.values(practice.firstResults).filter(Boolean).length;
    const wrong = completed - correct;
    return { completed, correct, wrong, rate: completed ? Math.round((correct / completed) * 100) : null };
  }

  function updateWrongButton() {
    const button = $('#wrong-only-button');
    if (!button) return;
    const count = activeWrongCount();
    button.disabled = !wrongOnly && count === 0;
    button.classList.toggle('active', wrongOnly);
    button.innerHTML = wrongOnly ? `返回整套刷题 <span>${count}</span>` : `错题模式：只刷错题 <span id="wrong-count">${count}</span>`;
  }

  function updateSidebar() {
    if (mode === 'exam') {
      const progress = examProgress();
      const percent = Math.round((progress.answered / paper.question_count) * 100);
      $('#answered-count').textContent = progress.answered;
      $('#progress-percent').textContent = `${percent}%`;
      $('#progress-ring').style.setProperty('--progress', percent);
      paper.questions.forEach((question) => {
        const done = isAnswered(question, progress.answers[question.number]);
        grid.querySelector(`[data-nav="${question.number}"]`)?.classList.toggle('answered', done);
        $(`#question-${question.number}`)?.classList.toggle('answered', done);
      });
      return progress;
    }

    const stats = practiceProgress();
    const numbers = practiceQuestionNumbers();
    const percent = Math.round((stats.completed / paper.question_count) * 100);
    $('#answered-count').textContent = stats.completed;
    $('#progress-percent').textContent = `${percent}%`;
    $('#progress-ring').style.setProperty('--progress', percent);
    $('#practice-completed').textContent = stats.completed;
    $('#practice-correct').textContent = stats.correct;
    $('#practice-wrong').textContent = stats.wrong;
    $('#practice-rate').textContent = stats.rate === null ? '--' : `${stats.rate}%`;
    updateWrongButton();

    paper.questions.forEach((question) => {
      const link = grid.querySelector(`[data-nav="${question.number}"]`);
      const completed = hasFirstResult(question.number);
      link?.classList.toggle('answered', completed);
      link?.classList.toggle('practice-correct', practice.firstResults[question.number] === true);
      link?.classList.toggle('practice-wrong', practice.firstResults[question.number] === false);
      link.hidden = wrongOnly && !numbers.includes(question.number);
    });
    return stats;
  }

  function writeStorage(key, value) {
    if (!canStore) return;
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { canStore = false; storageStatus.textContent = '浏览器禁止本地存储，请使用“导出记录”保存。'; }
  }

  function examSnapshot() {
    const progress = examProgress();
    return { version: 1, paperId: paper.id, paperTitle: paper.title, savedAt: new Date().toISOString(), elapsed: examElapsed, submitted, answers: progress.answers };
  }

  function practiceSnapshot() {
    practice.answers = mode === 'practice' ? collectAnswers() : practice.answers;
    practice.savedAt = new Date().toISOString();
    return practice;
  }

  function saveExam() {
    writeStorage(examStorageKey, examSnapshot());
    if (canStore) storageStatus.textContent = `模拟考试已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  }

  function savePractice() {
    writeStorage(practiceStorageKey, practiceSnapshot());
    if (canStore) storageStatus.textContent = `刷题记录已保存 · ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`;
  }

  function normalizePracticeState(saved) {
    const fallback = emptyPracticeState();
    if (!saved || saved.paperId !== paper.id) return fallback;
    return { ...fallback, ...saved, version: 3, answers: saved.answers || {}, firstResults: saved.firstResults || {}, attempts: saved.attempts || {}, latestResults: saved.latestResults || {}, revealed: saved.revealed || {}, history: saved.history || {} };
  }

  function loadRecords() {
    try {
      const savedExam = JSON.parse(localStorage.getItem(examStorageKey) || 'null');
      if (savedExam?.paperId === paper.id) {
        examElapsed = Number(savedExam.elapsed) || 0;
        submitted = Boolean(savedExam.submitted);
        examAnswers = savedExam.answers || {};
      }
      if (hasAnswers) {
        const savedPractice = JSON.parse(localStorage.getItem(practiceStorageKey) || localStorage.getItem(oldPracticeStorageKey) || localStorage.getItem(olderPracticeStorageKey) || 'null');
        practice = normalizePracticeState(savedPractice);
        mode = localStorage.getItem(modeStorageKey) === 'practice' ? 'practice' : 'exam';
      }
      storageStatus.textContent = savedExam || practice.savedAt ? '已恢复本机保存的学习记录。' : '本地存储可用，开始作答后自动保存。';
    } catch (error) {
      canStore = false;
      storageStatus.textContent = '无法读取本地记录，可使用导入/导出功能。';
    }
  }

  function startTimer() {
    if (tickHandle) return;
    tickHandle = window.setInterval(() => {
      if (mode === 'exam') {
        if (submitted) return;
        examElapsed += 1;
        timer.textContent = formatTime(examElapsed);
        if (examElapsed % 10 === 0) saveExam();
      } else {
        practice.elapsed += 1;
        timer.textContent = formatTime(practice.elapsed);
        if (practice.elapsed % 10 === 0) savePractice();
      }
    }, 1000);
  }

  function lockForCurrentMode() {
    const lock = mode === 'exam' && submitted;
    form.querySelectorAll('input, textarea').forEach((control) => { control.disabled = lock; });
    document.body.classList.toggle('is-submitted', lock);
    $('#submit-button').disabled = lock;
  }

  function showSummary() {
    const progress = examProgress();
    $('#summary-answered').textContent = progress.answered;
    $('#summary-unanswered').textContent = progress.unanswered;
    $('#summary-time').textContent = formatTime(examElapsed);
    $('#summary-modal').hidden = false;
  }

  function normalizeAnswer(value) {
    return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ');
  }

  function isPracticeCorrect(question, value) {
    const reference = question.reference;
    if (!reference) return false;
    if (question.type === '单选题' || question.type === '判断题') return value === reference.answer[0];
    if (question.type === '多选题') {
      const selected = new Set(Array.isArray(value) ? value : []);
      const expected = new Set(reference.answer);
      return selected.size === expected.size && [...selected].every((item) => expected.has(item));
    }
    if (question.type === '填空题') {
      if (!Array.isArray(value) || value.length !== question.blank_count) return false;
      return value.every((entry, index) => {
        const accepted = [reference.answer[index], ...(reference.accepted[index] || [])];
        const normalized = normalizeAnswer(entry);
        return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
      });
    }
    return false;
  }

  function showReference(question, verdictText = '参考答案', verdictClass = '') {
    const panel = $(`[data-feedback="${question.number}"]`);
    const verdict = $(`[data-verdict="${question.number}"]`);
    if (!panel || !verdict) return;
    panel.hidden = false;
    verdict.textContent = verdictText;
    verdict.className = `feedback-verdict ${verdictClass}`.trim();
    const selfGrade = $(`[data-self-grade="${question.number}"]`);
    if (selfGrade) selfGrade.hidden = false;
  }

  function paintObjectiveResult(question, correct) {
    const card = $(`#question-${question.number}`);
    if (!card) return;
    card.classList.toggle('practice-correct-state', correct);
    card.classList.toggle('practice-wrong-state', !correct);
    const correctSet = new Set(correctLabels(question));
    card.querySelectorAll('.option-row').forEach((row) => {
      const input = row.querySelector('input');
      row.classList.toggle('correct-option', correctSet.has(row.dataset.option));
      row.classList.toggle('wrong-option', Boolean(input?.checked) && !correctSet.has(row.dataset.option));
    });
  }

  function recordPracticeResult(question, correct) {
    const number = question.number;
    const firstAttempt = !hasFirstResult(number);
    const history = practice.history[number] || { attempts: 0 };
    practice.attempts[number] = (Number(practice.attempts[number]) || 0) + 1;
    practice.latestResults[number] = correct;
    if (firstAttempt) practice.firstResults[number] = correct;

    if (!correct) {
      practice.history[number] = { ...history, wrong: true, mastered: false, attempts: (history.attempts || 0) + 1, lastWrongAt: new Date().toISOString() };
    } else if (wrongOnly || history.wrong) {
      practice.history[number] = { ...history, wrong: Boolean(history.wrong), mastered: true, attempts: (history.attempts || 0) + 1, masteredAt: new Date().toISOString() };
    }
  }

  function judgeQuestion(question) {
    const answers = collectAnswers();
    const value = answers[question.number];
    if (!isAnswered(question, value)) {
      alert(question.type === '填空题' ? '请填写全部空格后再确认。' : '请先选择答案。');
      return;
    }
    practice.answers = answers;
    const correct = isPracticeCorrect(question, value);
    recordPracticeResult(question, correct);
    paintObjectiveResult(question, correct);
    const retryNote = practice.firstResults[question.number] === false && correct ? '（本次已答对，首次结果仍计为错误）' : '';
    const masteredNote = wrongOnly && correct ? '（已掌握，将移出错题列表）' : '';
    showReference(question, correct ? `回答正确 ${retryNote}${masteredNote}` : `回答错误，正确答案：${answerLabel(question)}`, correct ? 'correct' : 'wrong');
    updateSidebar();
    updatePracticeView();
    savePractice();
  }

  function restorePracticeFeedback() {
    paper.questions.forEach((question) => {
      if (practice.revealed[question.number]) showReference(question);
      if (Object.prototype.hasOwnProperty.call(practice.latestResults, question.number)) {
        const correct = practice.latestResults[question.number];
        paintObjectiveResult(question, correct);
        showReference(question, correct ? '最近一次回答正确' : `最近一次回答错误，正确答案：${answerLabel(question)}`, correct ? 'correct' : 'wrong');
      }
    });
  }

  function updatePracticeView() {
    if (!hasAnswers || mode !== 'practice') return;
    const numbers = practiceQuestionNumbers();
    const visibleNumbers = new Set(numbers);
    const emptyPanel = $('#practice-empty');
    if (emptyPanel) emptyPanel.hidden = numbers.length !== 0;
    paper.questions.forEach((question) => {
      const card = $(`#question-${question.number}`);
      if (card) card.hidden = !visibleNumbers.has(question.number);
    });
    updateSidebar();
  }

  function switchMode(nextMode, { initial = false } = {}) {
    if (!hasAnswers || (nextMode === mode && !initial)) return;
    if (!initial) {
      if (mode === 'exam') { examAnswers = collectAnswers(); saveExam(); }
      else { practice.answers = collectAnswers(); savePractice(); }
    }
    mode = nextMode;
    document.body.classList.toggle('practice-mode', mode === 'practice');
    document.body.dataset.mode = mode;
    document.querySelectorAll('.mode-button').forEach((button) => {
      button.classList.toggle('active', button.dataset.mode === mode);
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    });
    $('#practice-panel').hidden = mode !== 'practice';
    $('#submit-button').hidden = mode === 'practice';
    $('#reset-button').hidden = mode === 'practice';
    document.querySelectorAll('.practice-action').forEach((button) => { button.hidden = mode !== 'practice'; });
    $('#mode-note-title').textContent = mode === 'practice' ? '快速刷题模式' : '模拟考试模式';
    $('#mode-note-copy').textContent = mode === 'practice'
      ? '选择后即时判定；错题会自动进入错题模式；解析已改成看得懂版，不需要再翻书找原因。'
      : '模拟考试不显示答案、不自动评分；切换到快速刷题可即时判定并查看看懂版解析。';

    if (mode === 'exam') {
      wrongOnly = false;
      applyAnswers(examAnswers);
      paper.questions.forEach((question) => { $(`#question-${question.number}`).hidden = false; });
      grid.querySelectorAll('a').forEach((link) => { link.hidden = false; });
      timer.textContent = formatTime(examElapsed);
      lockForCurrentMode();
      updateSidebar();
    } else {
      applyAnswers(practice.answers);
      restorePracticeFeedback();
      timer.textContent = formatTime(practice.elapsed);
      lockForCurrentMode();
      updatePracticeView();
    }
    try { localStorage.setItem(modeStorageKey, mode); } catch (error) { /* no-op */ }
  }

  function exportRecord() {
    if (mode === 'exam') examAnswers = collectAnswers();
    if (mode === 'practice') practice.answers = collectAnswers();
    const payload = { version: 2, paperId: paper.id, paperTitle: paper.title, exportedAt: new Date().toISOString(), exam: examSnapshot(), practice: hasAnswers ? practiceSnapshot() : null };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${paper.id}-学习记录.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function importRecord(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const saved = JSON.parse(reader.result);
        if (saved.paperId !== paper.id) throw new Error('试卷编号不匹配');
        if (saved.exam) {
          examElapsed = Number(saved.exam.elapsed) || 0;
          submitted = Boolean(saved.exam.submitted);
          examAnswers = saved.exam.answers || {};
          if (saved.practice) practice = normalizePracticeState(saved.practice);
        } else {
          examElapsed = Number(saved.elapsed) || 0;
          submitted = Boolean(saved.submitted);
          examAnswers = saved.answers || {};
        }
        writeStorage(examStorageKey, examSnapshot());
        writeStorage(practiceStorageKey, practiceSnapshot());
        switchMode(mode, { initial: true });
        alert('学习记录已导入。');
      } catch (error) {
        alert(`无法导入：${error.message}`);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  renderQuestions();
  loadRecords();
  if (hasAnswers) switchMode(mode, { initial: true });
  else {
    applyAnswers(examAnswers);
    timer.textContent = formatTime(examElapsed);
    lockForCurrentMode();
    updateSidebar();
  }
  startTimer();

  form.addEventListener('input', (event) => {
    if (mode === 'exam') { updateSidebar(); saveExam(); return; }
    practice.answers = collectAnswers();
    savePractice();
    const card = event.target.closest('.question-card');
    if (card) card.classList.remove('practice-correct-state', 'practice-wrong-state');
  });

  form.addEventListener('change', (event) => {
    if (mode === 'exam') { updateSidebar(); saveExam(); return; }
    practice.answers = collectAnswers();
    const card = event.target.closest('.question-card');
    const question = paper.questions.find((item) => item.number === Number(card?.dataset.question));
    if (question && ['单选题', '判断题'].includes(question.type)) judgeQuestion(question);
    else savePractice();
  });

  document.querySelectorAll('.mark-button').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.question-card');
      const marked = card.classList.toggle('marked');
      button.textContent = marked ? '◆' : '◇';
    });
  });

  document.querySelectorAll('.mode-button').forEach((button) => {
    button.addEventListener('click', () => switchMode(button.dataset.mode));
  });

  questionsRoot.addEventListener('click', (event) => {
    const confirmButton = event.target.closest('.confirm-answer');
    if (confirmButton) {
      const question = paper.questions.find((item) => item.number === Number(confirmButton.dataset.confirm));
      if (question) judgeQuestion(question);
      return;
    }
    const revealButton = event.target.closest('.reveal-answer');
    if (revealButton) {
      const question = paper.questions.find((item) => item.number === Number(revealButton.dataset.reveal));
      if (!question) return;
      practice.revealed[question.number] = true;
      showReference(question);
      savePractice();
      return;
    }
    const gradeButton = event.target.closest('.self-grade-button');
    if (gradeButton) {
      const wrapper = gradeButton.closest('.self-grade');
      const question = paper.questions.find((item) => item.number === Number(wrapper.dataset.selfGrade));
      if (!question) return;
      const correct = gradeButton.dataset.grade === 'correct';
      recordPracticeResult(question, correct);
      const card = $(`#question-${question.number}`);
      card.classList.toggle('practice-correct-state', correct);
      card.classList.toggle('practice-wrong-state', !correct);
      showReference(question, correct ? '已标记为会做' : '已加入错题记录', correct ? 'correct' : 'wrong');
      updateSidebar();
      updatePracticeView();
      savePractice();
      return;
    }
    if (event.target.closest('#return-all-questions')) {
      wrongOnly = false;
      updatePracticeView();
    }
  });

  $('#submit-button').addEventListener('click', () => {
    const progress = examProgress();
    const message = progress.unanswered ? `还有 ${progress.unanswered} 题未作答，仍要交卷吗？` : '确认交卷吗？交卷后答题框将锁定。';
    if (!confirm(message)) return;
    submitted = true;
    lockForCurrentMode();
    saveExam();
    showSummary();
  });

  $('#reset-button').addEventListener('click', () => {
    if (!confirm('确认清空本试卷的模拟考试答案和计时吗？刷题错题记录不会受影响。')) return;
    try { localStorage.removeItem(examStorageKey); } catch (error) { /* no-op */ }
    examAnswers = {};
    examElapsed = 0;
    submitted = false;
    applyAnswers({});
    timer.textContent = formatTime(0);
    lockForCurrentMode();
    updateSidebar();
    storageStatus.textContent = '已清空模拟考试记录，重新开始作答。';
  });

  $('#reset-practice-button')?.addEventListener('click', () => {
    if (!confirm('确认重置本轮刷题答案、首次结果和计时吗？历史错题记录会保留。')) return;
    const history = practice.history;
    practice = emptyPracticeState();
    practice.history = history;
    applyAnswers({});
    timer.textContent = formatTime(0);
    updatePracticeView();
    savePractice();
  });

  $('#clear-wrong-button')?.addEventListener('click', () => {
    if (!confirm('确认清空本试卷的全部历史错题记录吗？本轮作答统计会保留。')) return;
    practice.history = {};
    wrongOnly = false;
    updatePracticeView();
    savePractice();
  });

  $('#wrong-only-button')?.addEventListener('click', () => {
    if (!wrongOnly && activeWrongCount() === 0) return;
    wrongOnly = !wrongOnly;
    if (wrongOnly) {
      paper.questions.forEach((question) => {
        const record = practice.history[question.number];
        if (!record?.wrong || record?.mastered) return;
        delete practice.answers[question.number];
        delete practice.latestResults[question.number];
        delete practice.revealed[question.number];
      });
      applyAnswers(practice.answers);
      restorePracticeFeedback();
    }
    updatePracticeView();
    savePractice();
  });

  $('#export-button')?.addEventListener('click', exportRecord);
  $('#import-input')?.addEventListener('change', (event) => {
    const [file] = event.target.files;
    if (file) importRecord(file);
    event.target.value = '';
  });
  $('#print-button')?.addEventListener('click', () => window.print());
  $('#close-summary')?.addEventListener('click', () => { $('#summary-modal').hidden = true; });
  $('#mobile-nav-button')?.addEventListener('click', () => sidebar.classList.add('open'));
  $('#close-nav')?.addEventListener('click', () => sidebar.classList.remove('open'));

  grid.addEventListener('click', (event) => {
    const link = event.target.closest('[data-nav]');
    if (mode === 'practice' && link) {
      event.preventDefault();
      const number = Number(link.dataset.nav);
      if (practiceQuestionNumbers().includes(number)) document.querySelector(`#question-${number}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    sidebar.classList.remove('open');
  });

  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    grid.querySelectorAll('a').forEach((link) => link.classList.remove('current'));
    const number = visible.target.dataset.question;
    grid.querySelector(`[data-nav="${number}"]`)?.classList.add('current');
  }, { rootMargin: '-25% 0px -60% 0px', threshold: [0.1, 0.5] });
  document.querySelectorAll('.question-card').forEach((card) => observer.observe(card));

  window.addEventListener('beforeunload', () => {
    if (mode === 'exam') saveExam();
    else savePractice();
  });
})();
