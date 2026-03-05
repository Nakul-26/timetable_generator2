import axios from 'axios';

const API = axios.create({ 
    baseURL: import.meta.env.VITE_BACKEND_URL, 
    withCredentials: true 
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
    return Promise.reject(error);
  }
);

export default API;
