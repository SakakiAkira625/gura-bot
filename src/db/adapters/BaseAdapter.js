class BaseAdapter {
  async initialize() {
    throw new Error('initialize() must be implemented');
  }

  async run(sql, params) {
    throw new Error('run() must be implemented');
  }

  async get(sql, params) {
    throw new Error('get() must be implemented');
  }

  async all(sql, params) {
    throw new Error('all() must be implemented');
  }

  async close() {
    throw new Error('close() must be implemented');
  }
}

module.exports = BaseAdapter;
