export const pool = {
  async query(sql, params) {
    await new Promise(r => setTimeout(r, 1));
    return { rows: [{ id: 1, user_id: 1, items: [], total: 0 }] };
  },
  async connect() {
    let released = false;
    return {
      async query(sql, params) {
        await new Promise(r => setTimeout(r, 1));
        return { rows: [{ id: 1 }] };
      },
      release() {
        released = true;
      },
    };
  },
};

