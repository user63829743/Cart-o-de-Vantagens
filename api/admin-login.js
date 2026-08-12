const {
  clearSessionCookie,
  getAdminPassword,
  isValidSession,
  readBody,
  secureEquals,
  sendJson,
  setSessionCookie,
} = require('../lib/admin-auth');

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { ok: false, error: 'Método não permitido.' });
  }

  const { action, password } = readBody(request);

  if (action === 'login') {
    try {
      if (!secureEquals(password, getAdminPassword())) {
        return sendJson(response, 401, { ok: false, error: 'Senha incorreta. Tente novamente.' });
      }
      setSessionCookie(response);
      return sendJson(response, 200, { ok: true });
    } catch (error) {
      return sendJson(response, 500, { ok: false, error: error.message || 'Não foi possível configurar o acesso administrativo.' });
    }
  }

  if (action === 'logout') {
    clearSessionCookie(response);
    return sendJson(response, 200, { ok: true });
  }

  if (action === 'session') {
    if (!isValidSession(request)) {
      return sendJson(response, 401, { ok: false, error: 'Sessão administrativa expirada.' });
    }
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 400, { ok: false, error: 'Ação inválida.' });
};
