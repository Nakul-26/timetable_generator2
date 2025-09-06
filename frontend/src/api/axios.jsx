import axios from 'axios';
const API = axios.create({ baseURL: import.meta.env.REACT_APP_API || 'http://localhost:5000/api' });
export default API;
