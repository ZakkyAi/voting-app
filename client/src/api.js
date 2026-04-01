import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: BASE,
  timeout: 10000,
});

export const getStatements = () => api.get('/api/statements');
export const getMyVotes = () => api.get('/api/my-votes');

export const castVote = (statementId, type, turnstileToken) =>
  api.post('/api/vote', { statementId, type, turnstileToken });

export const createStatement = (text, adminKey) =>
  api.post('/api/statements', { text }, { headers: { 'x-admin-key': adminKey } });

export const deleteStatement = (id, adminKey) =>
  api.delete(`/api/statements/${id}`, { headers: { 'x-admin-key': adminKey } });

export default api;
