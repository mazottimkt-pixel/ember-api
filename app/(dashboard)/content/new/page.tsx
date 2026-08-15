import { createContent } from "../actions";
export default function NewContent() {
  return (
    <>
      <div className="topline">
        <div>
          <span className="eyebrow">LUME • IA</span>
          <h1>Criar conteúdo</h1>
          <p className="muted">
            A IA usa somente os dados informados e o perfil da marca. Nada será
            publicado automaticamente.
          </p>
        </div>
      </div>
      <form className="panel form-grid" action={createContent}>
        <input type="hidden" name="request_id" value={crypto.randomUUID()} />
        <label className="field">
          Tipo
          <select name="type">
            <option value="instagram_post">Post para Instagram</option>
            <option value="caption">Legenda</option>
            <option value="reels">Roteiro para Reels</option>
            <option value="stories">Stories</option>
            <option value="campaign">Campanha promocional</option>
            <option value="ideas">Ideias de conteúdo</option>
            <option value="calendar">Calendário básico</option>
          </select>
        </label>
        <label className="field">
          Objetivo
          <input name="objective" required />
        </label>
        <label className="field full">
          Assunto, produto ou serviço
          <textarea name="subject" required />
        </label>
        <label className="field">
          Público
          <input name="audience" required />
        </label>
        <label className="field">
          Tom
          <input name="tone" required defaultValue="Profissional" />
        </label>
        <label className="field">
          Oferta, se houver
          <input name="offer" />
        </label>
        <label className="field">
          Preço informado, se houver
          <input name="price" />
        </label>
        <label className="field">
          Prazo real, se houver
          <input name="deadline" />
        </label>
        <label className="field">
          Tamanho
          <select name="length">
            <option value="medium">Médio</option>
            <option value="short">Curto</option>
            <option value="detailed">Detalhado</option>
          </select>
        </label>
        <label className="field">
          Duração do Reels
          <select name="duration">
            <option value="30">30 segundos</option>
            <option value="15">15 segundos</option>
            <option value="45">45 segundos</option>
            <option value="60">60 segundos</option>
          </select>
        </label>
        <label className="field">
          Stories
          <select name="story_count">
            <option value="3">3 telas</option>
            <option value="1">1 tela</option>
            <option value="5">5 telas</option>
          </select>
        </label>
        <label className="field">
          Calendário
          <select name="calendar_days">
            <option value="7">7 dias</option>
            <option value="15">15 dias</option>
            <option value="30">30 dias</option>
          </select>
        </label>
        <button className="button">Gerar texto com IA</button>
      </form>
    </>
  );
}
