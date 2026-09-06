import { Link } from "react-router-dom";
import { IconFortuna } from "../components/Icons";

function LegalPage({ title, children }) {
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--bg-page)", color: "var(--text-base)" }} className="p-4">
      <div className="max-w-2xl mx-auto py-8">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <IconFortuna className="w-8 h-8 block" />
          <span className="font-bold">Fortuna</span>
        </Link>
        <div className="card p-6 md:p-8 space-y-4" style={{ fontSize: "0.875rem", lineHeight: 1.7, color: "var(--text-secondary)" }}>
          <h1 style={{ color: "var(--text-base)" }} className="text-xl font-bold mb-2">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}

const H2 = ({ children }) => <h2 style={{ color: "var(--text-base)" }} className="text-base font-semibold pt-2">{children}</h2>;

export function Terms() {
  return (
    <LegalPage title="Termos de Uso">
      <p>Última atualização: setembro de 2026.</p>
      <p>
        Estes Termos regem o uso do Fortuna, uma ferramenta de organização financeira
        pessoal. Ao criar uma conta, você concorda com estes termos.
      </p>

      <H2>O que o Fortuna é (e não é)</H2>
      <p>
        O Fortuna ajuda você a registrar e visualizar suas próprias movimentações
        financeiras. Ele não é uma instituição financeira, não movimenta dinheiro real,
        não tem acesso às suas contas bancárias reais e não oferece consultoria de
        investimento — todos os valores são informados manualmente (ou por meio do
        assistente de IA) por você.
      </p>

      <H2>Sua conta</H2>
      <p>
        Você é responsável por manter sua senha em sigilo e por tudo que acontecer na
        sua conta. Avise-nos se suspeitar de acesso não autorizado.
      </p>

      <H2>Assistente de IA</H2>
      <p>
        O assistente pode ler e propor alterações nos seus dados financeiros a partir
        do que você escreve no chat. Nenhuma ação de criação, edição ou exclusão é
        aplicada sem sua confirmação explícita. Para funcionar, suas mensagens e dados
        financeiros relevantes são enviados ao provedor do modelo de IA utilizado (hoje,
        a OpenAI) — veja a Política de Privacidade para mais detalhes.
      </p>

      <H2>Cancelamento e exclusão de conta</H2>
      <p>
        Você pode excluir sua conta a qualquer momento em Configurações → Dados. A
        exclusão remove permanentemente seus dados cadastrados nesta plataforma e não
        pode ser desfeita.
      </p>

      <H2>Isenções</H2>
      <p>
        O serviço é fornecido "como está". Fazemos o possível para manter cálculos e
        projeções corretos, mas eles são estimativas baseadas nos dados que você
        informa — não são garantia de resultado financeiro real, e decisões financeiras
        continuam sendo sua responsabilidade.
      </p>

      <H2>Contato</H2>
      <p>Dúvidas sobre estes termos: [e-mail de contato a definir].</p>

      <p style={{ fontSize: "0.75rem", fontStyle: "italic" }}>
        Este é um documento inicial e pode não cobrir todos os requisitos legais
        aplicáveis à sua jurisdição — recomenda-se revisão jurídica antes de depender
        dele para fins de conformidade.
      </p>
    </LegalPage>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalPage title="Política de Privacidade">
      <p>Última atualização: setembro de 2026.</p>
      <p>
        Esta política explica quais dados o Fortuna coleta, para quê, e quais direitos
        você tem sobre eles, em linha com a Lei Geral de Proteção de Dados (LGPD).
      </p>

      <H2>Quais dados coletamos</H2>
      <p>
        Dados de cadastro (nome, e-mail, senha — armazenada de forma criptografada, nunca
        em texto puro); dados financeiros que você informa (lançamentos, contas,
        cartões, categorias); e, se você usar o assistente de IA, o conteúdo das suas
        conversas com ele.
      </p>

      <H2>Com quem compartilhamos</H2>
      <p>
        Não vendemos seus dados. Quando você usa o assistente de IA, o texto da
        conversa e os dados financeiros necessários para respondê-la são enviados ao
        provedor do modelo de linguagem utilizado (hoje, a OpenAI), como parte do
        processamento daquela mensagem. Esse provedor atua como operador de dados sob
        nossa responsabilidade, não como um terceiro que reutiliza seus dados para
        outros fins.
      </p>

      <H2>Onde seus dados ficam</H2>
      <p>
        Seus dados ficam num banco de dados que só sua conta autenticada pode acessar.
        Não usamos seus dados financeiros para treinar modelos de IA.
      </p>

      <H2>Seus direitos</H2>
      <p>
        Você pode a qualquer momento: exportar uma cópia dos seus dados (Configurações →
        Dados → Exportar backup); corrigir dados incorretos (editando diretamente no
        app); e excluir permanentemente sua conta e todos os dados associados
        (Configurações → Dados → Excluir conta).
      </p>

      <H2>Cookies e armazenamento local</H2>
      <p>
        Usamos o armazenamento local do navegador (localStorage) apenas para manter
        você conectado (token de sessão) e lembrar preferências de exibição (ex.: tema
        claro/escuro) — não para rastreamento ou publicidade.
      </p>

      <H2>Contato</H2>
      <p>Dúvidas sobre seus dados: [e-mail de contato a definir].</p>

      <p style={{ fontSize: "0.75rem", fontStyle: "italic" }}>
        Este é um documento inicial e pode não cobrir todos os requisitos legais
        aplicáveis à sua jurisdição — recomenda-se revisão jurídica antes de depender
        dele para fins de conformidade.
      </p>
    </LegalPage>
  );
}
