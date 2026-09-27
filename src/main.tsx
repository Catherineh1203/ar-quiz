import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initStore } from './lib/quizEngine';
import 'tdesign-react/esm/style/index.js';
import './index.css';

initStore();
document.title = 'A&R 模拟题库';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
