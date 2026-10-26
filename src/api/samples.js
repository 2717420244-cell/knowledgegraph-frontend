/**
 * 内置示例笔记（P2-10 空状态引导）。
 *
 * 用途：新用户零笔记时，NotesView 空状态提供「载入示例笔记」一键导入，
 * 逐篇 createNote + parseNote，让用户最快看到"笔记 → 图谱 → 问答"完整链路。
 *
 * 内容围绕 AI 学习主题，与系统聚焦领域一致；
 * 每篇都保证有可抽取的实体与关系，解析后能形成 ≥30 节点的图谱。
 */

export const SAMPLE_NOTES = [
  {
    title: 'RAG 检索增强生成入门',
    sourceUrl: 'https://example.com/rag-intro',
    content: `# RAG 检索增强生成

RAG（Retrieval-Augmented Generation，检索增强生成）是一种结合信息检索与大模型生成的技术范式。

## 核心思想
RAG 的工作流程分为两步：
1. **检索**：用户提问后，先通过向量检索从知识库中召回与问题相关的文档片段
2. **生成**：把召回的内容拼进 Prompt，交给大语言模型生成最终答案

## 为什么需要 RAG
- 缓解大模型的**幻觉**问题：答案有据可依，可以溯源
- 知识可以随时更新，不需要重新训练模型
- 相比微调，成本低得多

## 关键组件
RAG 系统依赖向量检索，而向量检索又依赖 Embedding 模型把文本转成向量。
检索质量还严重依赖分块策略和相似度计算方式。

RAG 与微调不是替代关系，而是互补关系：微调改变模型"会什么"，RAG 改变模型"看到什么"。`
  },
  {
    title: '向量检索与 Embedding 笔记',
    sourceUrl: 'https://example.com/vector-search',
    content: `# 向量检索与 Embedding

Embedding 是把文本映射成稠密向量的技术，是语义检索的基础。

## 向量检索的流程
1. 文档经过**分块**后，由 Embedding 模型编码为向量
2. 向量存入向量数据库（如 Milvus）
3. 查询时把问题也编码成向量，用相似度（余弦相似度最常用）找最近邻

## 常见问题
- **维度灾难**：向量维度高、数据量大时，暴力搜索不可行，需要 ANN 索引（如 HNSW）
- **语义鸿沟**：字面相似不等于语义相关，Embedding 模型的质量决定召回上限
- **分块策略**：块太大稀释语义，块太小丢失上下文

## 与知识图谱的关系
向量检索擅长"模糊找相似"，知识图谱擅长"精确找关联"。
GraphRAG 把两者结合：先在图上做多跳扩展，再补充向量召回的内容。`
  },
  {
    title: 'Transformer 与自注意力机制',
    sourceUrl: 'https://example.com/transformer',
    content: `# Transformer 与自注意力

Transformer 是目前大语言模型的基础架构，由 Google 团队在 2017 年的论文 Attention Is All You Need 中提出。

## 自注意力机制
自注意力让序列中每个位置都能直接关注其他位置：
- 通过 Query、Key、Value 三个矩阵计算
- 复杂度是序列长度的平方，这就是**上下文窗口**受限的根源

## 位置编码
注意力本身对顺序不敏感，需要位置编码注入顺序信息。

## 衍生架构
- **BERT**：编码器架构，双向注意力，擅长理解任务
- **GPT**：解码器架构，单向注意力，擅长生成任务
- 大语言模型基本都采用 GPT 式的解码器堆叠

上下文窗口的大小决定了模型一次能"看到"多少内容，也直接影响 RAG 中可塞入的参考文本量。`
  },
  {
    title: 'Prompt 工程与上下文窗口',
    sourceUrl: 'https://example.com/prompt-engineering',
    content: `# Prompt 工程

Prompt 工程是通过设计输入文本来引导大模型产出期望结果的技术，成本最低的模型能力挖掘手段。

## 常用技巧
- **少样本示例**：在 Prompt 里给出输入输出示例
- **思维链**：要求模型一步步推理，复杂问题准确率显著提升
- **角色设定**：给模型一个明确身份，输出风格更稳定

## 上下文窗口的约束
所有技巧都受上下文窗口限制：示例、思维链、检索回来的资料都要占 token。
长上下文模型缓解了容量问题，但"迷失在中间"现象依然存在——模型对开头和结尾的内容更敏感。

## 与微调的对比
Prompt 工程不改模型参数，灵活但占推理成本；微调固化能力，推理便宜但训练成本高。
实践中通常先做 Prompt 工程，效果不够再考虑微调。`
  },
  {
    title: 'GraphRAG：让 RAG 理解知识关联',
    sourceUrl: 'https://example.com/graphrag',
    content: `# GraphRAG

GraphRAG 是把知识图谱引入 RAG 流程的增强方案，解决传统 RAG"只会找相似、不会找关联"的问题。

## 传统 RAG 的短板
向量检索只能召回语义相似的片段，无法回答需要跨文档多跳推理的问题，
比如"A 技术依赖的 B 技术又是谁提出的"——这类答案藏在关系的传递链上。

## GraphRAG 的做法
1. 用大模型从文档中抽取实体和关系，构建知识图谱
2. 提问时先在图上定位命中实体，再做**子图扩展**（多跳遍历）
3. 把结构化的关系路径与向量召回结果一起送入大模型生成答案

## 优势
- 支持多跳推理，能回答关系型问题
- 答案可溯源到具体节点与笔记
- 孤立节点可以暴露知识盲区

知识图谱的构建质量直接决定 GraphRAG 的上限，实体归一化和噪声过滤是工程难点。`
  }
]

/**
 * 逐篇导入示例笔记：createNote + parseNote。
 * 返回 { created, parsed, failed } 统计。
 *
 * 注意：parseNote 每篇要 10~30 秒（调 LLM），调用方必须给出进度提示。
 */
export async function importSampleNotes({ onProgress } = {}) {
  let created = 0
  let parsed = 0
  let failed = 0

  for (let i = 0; i < SAMPLE_NOTES.length; i++) {
    const note = SAMPLE_NOTES[i]
    try {
      if (onProgress) onProgress({ index: i, total: SAMPLE_NOTES.length, title: note.title, phase: 'creating' })
      const vo = await createNote({
        title: note.title,
        content: note.content,
        sourceUrl: note.sourceUrl
      })
      created++

      if (onProgress) onProgress({ index: i, total: SAMPLE_NOTES.length, title: note.title, phase: 'parsing' })
      await parseNote(vo.id)
      parsed++
    } catch (e) {
      failed++
      // 单篇失败不中断整体导入
      console.warn('示例笔记导入失败：', note.title, e)
    }
  }

  return { created, parsed, failed }
}
