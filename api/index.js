'use strict';

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const { handleApiRequest, loadDb, db } = require('../server');

let isInitialized = false;

module.exports = async (req, res) => {
  // Ensure DB / Supabase is initialized once in serverless instance
  if (!isInitialized) {
    try {
      await loadDb();
      isInitialized = true;
    } catch (err) {
      console.error('Initialization error in serverless:', err);
    }
  }

  // Parse path
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (pathname.startsWith('/api/')) {
    return handleApiRequest(req, res, pathname);
  }

  res.statusCode = 404;
  res.end('Not found');
};
