import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { migrateLocalStorageKeys } from './lib/storage-keys';
import './theme/tokens.css';
import './theme/dark.css';

migrateLocalStorageKeys();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
