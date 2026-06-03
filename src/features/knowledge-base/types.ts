export type Priority = "alta" | "media" | "baixa";

export type KnowledgeItem = {
  id: string;
  title: string;
  description?: string;
  example?: string;
  priority: Priority;
};

export type KnowledgeCategory =
  | "discovery_required"
  | "discovery_recommended"
  | "pains"
  | "impacts"
  | "urgency_signals"
  | "authority_criteria"
  | "fit_criteria"
  | "objections"
  | "objection_breaks";

export type KnowledgeBase = Partial<Record<KnowledgeCategory, KnowledgeItem[]>>;

export const CATEGORY_META: { key: KnowledgeCategory; label: string; hint: string }[] = [
  { key: "discovery_required", label: "Perguntas obrigatórias de descoberta", hint: "Não podem faltar na call" },
  { key: "discovery_recommended", label: "Perguntas recomendadas", hint: "Aprofundam a qualificação" },
  { key: "pains", label: "Dores comuns", hint: "Dores típicas do segmento" },
  { key: "impacts", label: "Impactos esperados", hint: "Consequências das dores" },
  { key: "urgency_signals", label: "Sinais de urgência", hint: "Gatilhos que aceleram decisão" },
  { key: "authority_criteria", label: "Critérios de autoridade", hint: "Quem decide / influencia" },
  { key: "fit_criteria", label: "Critérios de fit OXY", hint: "Como avaliar fit do lead" },
  { key: "objections", label: "Objeções frequentes", hint: "Bloqueios mais comuns" },
  { key: "objection_breaks", label: "Quebras de objeção recomendadas", hint: "Respostas para superar objeções" },
];

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