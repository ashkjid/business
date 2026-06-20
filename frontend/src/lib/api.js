import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true, // send cookies for Emergent Google auth
});

api.interceptors.request.use((config) => {
  const t = localStorage.getItem("leadmap_token");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      const onLogin = window.location.pathname === "/login";
      const inAuthCallback = window.location.hash?.includes("session_id=");
      if (!onLogin && !inAuthCallback) {
        localStorage.removeItem("leadmap_token");
        localStorage.removeItem("leadmap_user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
