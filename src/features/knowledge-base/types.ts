export type Priority = "alta" | "media" | "baixa";

export type Operation = "outbound" | "inbound";
export type QualificationModel = "CHAMP" | "BANT";

export const OPERATION_LABEL: Record<Operation, string> = {
  outbound: "Outbound — CHAMP",
  inbound: "Inbound — BANT",
};

export const MODEL_FOR_OPERATION: Record<Operation, QualificationModel> = {
  outbound: "CHAMP",
  inbound: "BANT",
};

export type KnowledgeItem = {
  id: string;
  title: string;
  description?: string;
  example?: string;
  priority: Priority;
};

export type KnowledgeCategory = string;

export type CategoryItems = Partial<Record<string, KnowledgeItem[]>>;

/** Knowledge agora é namespaced por operação: { outbound: {...}, inbound: {...} }. */
export type KnowledgeBase = Partial<Record<Operation, CategoryItems>>;

export type CategoryMeta = { key: string; label: string; hint: string };

export const CATEGORY_META_BY_OP: Record<Operation, CategoryMeta[]> = {
  outbound: [
    { key: "discovery_required", label: "Perguntas obrigatórias (CHAMP)", hint: "Não podem faltar na call" },
    { key: "discovery_recommended", label: "Perguntas recomendadas", hint: "Aprofundam a qualificação" },
    { key: "pains", label: "Dores comuns", hint: "Dores típicas do segmento" },
    { key: "impacts", label: "Impactos esperados (Money)", hint: "Consequências financeiras/operacionais" },
    { key: "urgency_signals", label: "Sinais de urgência (Prioritization)", hint: "Gatilhos que aceleram decisão" },
    { key: "authority_criteria", label: "Critérios de autoridade (Champion)", hint: "Quem decide / influencia" },
    { key: "fit_criteria", label: "Critérios de fit OXY", hint: "Como avaliar fit do lead" },
    { key: "objections", label: "Objeções frequentes", hint: "Bloqueios mais comuns" },
    { key: "objection_breaks", label: "Quebras de objeção", hint: "Respostas para superar objeções" },
  ],
  inbound: [
    { key: "budget_questions", label: "Perguntas de Budget (B)", hint: "Como investigar orçamento" },
    { key: "authority_questions", label: "Perguntas de Authority (A)", hint: "Decisores e influenciadores" },
    { key: "need_questions", label: "Perguntas de Need (N)", hint: "Necessidade, dores e motivações" },
    { key: "timing_questions", label: "Perguntas de Timing (T)", hint: "Prazo e urgência" },
    { key: "intent_signals", label: "Sinais de alta intenção", hint: "Gatilhos de lead pronto" },
    { key: "pains_inbound", label: "Dores típicas de leads inbound", hint: "Dores recorrentes em quem procura a O2" },
    { key: "objections", label: "Objeções comuns", hint: "Bloqueios típicos em inbound" },
    { key: "objection_breaks", label: "Quebras consultivas", hint: "Respostas com tom consultivo" },
  ],
};

/** @deprecated mantido para compatibilidade — use CATEGORY_META_BY_OP[op]. */
export const CATEGORY_META = CATEGORY_META_BY_OP.outbound;

export type InsightFeedback = {
  trecho: string;
  problema: string;
  sugestao: string;
};

export type CallInsights = {
  resumo_geral: string;
  nota_geral: number; // 0-100
  perguntas_faltantes: string[];
  melhorias_perguntas: { feita: string; sugestao: string }[];
  objecoes_identificadas: { objecao: string; quebra_recomendada: string }[];
  oportunidades_perdidas: string[];
  pontos_positivos: string[];
  feedback_por_trecho: InsightFeedback[];
  plano_de_acao: string[];
};