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

async function rpc(name, payload) {
  return supabaseRequest(`rpc/${name}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
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

      case 'approveLead':
        await rpc('approve_partner_lead', {
          p_lead_id: normaliseId(payload.id),
          p_discount: String(payload.discount || '').trim(),
        });
        break;

      case 'rejectLead':
        await rpc('reject_partner_lead', { p_lead_id: normaliseId(payload.id) });
        break;

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
