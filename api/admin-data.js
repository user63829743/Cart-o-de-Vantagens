const { isValidSession, readBody, sendJson } = require('../lib/admin-auth');

function getConfig() {
  const url = String(process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no Vercel para operar o painel administrativo.');
  }
  return { url, key };
}

async function supabaseRequest(path, options = {}) {
  const { url, key } = getConfig();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Prefer: options.prefer || 'return=representation',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (_) { body = text; }
  if (!response.ok) {
    const message = body?.message || body?.hint || text || 'Erro ao acessar os dados do Supabase.';
    throw new Error(message);
  }
  return body;
}

function queryTable(table, order = 'created_at.asc') {
  return supabaseRequest(`${table}?select=*&order=${encodeURIComponent(order)}`, { method: 'GET', prefer: '' });
}

function normaliseId(value) {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new Error('Identificador inválido.');
  }
  return String(value);
}

function checkRequired(payload, fields) {
  for (const field of fields) {
    if (!String(payload[field] || '').trim()) {
      throw new Error(`O campo ${field} é obrigatório.`);
    }
  }
}

async function loadAll() {
  const [partners, members, leads, requests] = await Promise.all([
    queryTable('partners'),
    queryTable('members'),
    queryTable('partner_leads'),
    queryTable('partner_change_requests', 'created_at.desc'),
  ]);
  return { partners: partners || [], members: members || [], leads: leads || [], requests: requests || [] };
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, error: 'Método não permitido.' });
  }
  if (!isValidSession(request)) {
    return sendJson(response, 401, { ok: false, error: 'Sessão administrativa expirada. Entre novamente.' });
  }

  try {
    const payload = readBody(request);
    let result = null;

    switch (payload.action) {
      case 'loadAll':
        result = await loadAll();
        break;

      case 'createPartner': {
        checkRequired(payload, ['name', 'discount']);
        const rows = await supabaseRequest('partners', {
          method: 'POST',
          body: JSON.stringify({
            name: String(payload.name).trim(),
            category: String(payload.category || 'Outros').trim(),
            discount: String(payload.discount).trim(),
            contact: String(payload.contact || '').trim(),
            logo: payload.logo || null,
            status: 'ATIVO',
          }),
        });
        result = { partner: Array.isArray(rows) ? rows[0] : rows };
        break;
      }

      case 'deletePartner':
        await supabaseRequest(`partners?id=eq.${encodeURIComponent(normaliseId(payload.id))}`, { method: 'DELETE' });
        break;

      case 'createMember': {
        checkRequired(payload, ['name', 'cpf']);
        const rows = await supabaseRequest('members', {
          method: 'POST',
          body: JSON.stringify({
            name: String(payload.name).trim(),
            rg: String(payload.rg || '').trim(),
            cpf: String(payload.cpf).trim(),
            birth_date: payload.birth_date || null,
            phone: String(payload.phone || '').trim(),
            address: String(payload.address || '').trim(),
          }),
        });
        result = { member: Array.isArray(rows) ? rows[0] : rows };
        break;
      }

      case 'deleteMember':
        await supabaseRequest(`members?id=eq.${encodeURIComponent(normaliseId(payload.id))}`, { method: 'DELETE' });
        break;

      case 'approveLead': {
        const leadId = normaliseId(payload.id);
        const discount = String(payload.discount || '').trim();
        if (!discount) throw new Error('É obrigatório informar o benefício oferecido.');

        const leadRows = await supabaseRequest(
          `partner_leads?id=eq.${encodeURIComponent(leadId)}&select=*`,
          { method: 'GET', prefer: '' }
        );
        const lead = Array.isArray(leadRows) ? leadRows[0] : null;
        if (!lead) throw new Error('Cadastro de interessado não encontrado.');

        const partnerRows = await supabaseRequest('partners?on_conflict=lead_id', {
          method: 'POST',
          prefer: 'resolution=merge-duplicates,return=representation',
          body: JSON.stringify({
            lead_id: String(lead.id),
            owner_auth_id: lead.auth_user_id || null,
            name: String(lead.nome_fantasia || lead.business || '').trim(),
            category: String(lead.category || 'Outros').trim(),
            discount,
            contact: String(lead.phone || '').trim(),
            cnpj: String(lead.cnpj || '').trim() || null,
            razao_social: String(lead.razao_social || '').trim() || null,
            nome_fantasia: String(lead.nome_fantasia || '').trim() || null,
            logradouro_numero: String(lead.logradouro_numero || '').trim() || null,
            bairro: String(lead.bairro || '').trim() || null,
            localidade: String(lead.localidade || '').trim() || null,
            uf: String(lead.uf || '').trim() || null,
            cep: String(lead.cep || '').trim() || null,
            status: 'ATIVO',
          }),
        });

        await supabaseRequest(`partner_leads?id=eq.${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'ATIVO' }),
        });
        result = { partner: Array.isArray(partnerRows) ? partnerRows[0] : partnerRows };
        break;
      }

      case 'rejectLead': {
        const leadId = normaliseId(payload.id);
        const rows = await supabaseRequest(`partner_leads?id=eq.${encodeURIComponent(leadId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'NEGADA' }),
        });
        if (!Array.isArray(rows) || rows.length === 0) {
          throw new Error('Cadastro de interessado não encontrado.');
        }
        break;
      }

      case 'updateRequest': {
        const status = String(payload.status || '');
        if (!['APROVADA', 'RECUSADA'].includes(status)) {
          throw new Error('Status de solicitação inválido.');
        }
        await supabaseRequest(
          `partner_change_requests?id=eq.${encodeURIComponent(normaliseId(payload.id))}`,
          { method: 'PATCH', body: JSON.stringify({ status }) }
        );
        break;
      }

      default:
        throw new Error('Ação administrativa inválida.');
    }

    return sendJson(response, 200, { ok: true, ...(result || {}) });
  } catch (error) {
    console.error('Erro na API administrativa:', error);
    return sendJson(response, 400, { ok: false, error: error.message || 'Não foi possível concluir a operação administrativa.' });
  }
};
