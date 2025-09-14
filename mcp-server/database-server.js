
require('dotenv').config();
  const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
  const { CallToolRequestSchema, ListToolsRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
  const { pool } = require('../db/database.js');

  class DatabaseMCPServer {
    constructor() {
      this.server = new Server(
        {
          name: "discord-bot-database",
          version: "1.0.0"
        },
        {
          capabilities: {
            tools: {}
          }
        }
      );

      this.setupHandlers();
    }

    setupHandlers() {
      // List available tools
      this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: [
          {
            name: "query_users",
            description: "Query users table with filters",
            inputSchema: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                limit: { type: "number", default: 10 },
                order_by: { type: "string", enum: ["balance", "total_earned"] }
              }
            }
          },
          {
            name: "query_transactions",
            description: "Query transactions table",
            inputSchema: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                type: { type: "string", enum: ["voice_earn", "gift", "admin", "daily_checkin"] },
                limit: { type: "number", default: 10 }
              }
            }
          },
          {
            name: "get_leaderboard",
            description: "Get top users leaderboard",
            inputSchema: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["balance", "total_earned"] },
                limit: { type: "number", default: 10 }
              }
            }
          },
          {
            name: "get_user_stats",
            description: "Get detailed stats for a user",
            inputSchema: {
              type: "object",
              properties: {
                user_id: { type: "string" }
              },
              required: ["user_id"]
            }
          },
          {
            name: "query_daily_checkins",
            description: "Query daily checkin records",
            inputSchema: {
              type: "object",
              properties: {
                user_id: { type: "string" },
                limit: { type: "number", default: 10 },
                order_by: { type: "string", enum: ["current_streak", "total_checkins"] }
              }
            }
          }
        ]
      }));

      // Handle tool calls
      this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;

        try {
          switch (name) {
            case "query_users":
              return await this.queryUsers(args);
            case "query_transactions":
              return await this.queryTransactions(args);
            case "get_leaderboard":
              return await this.getLeaderboard(args);
            case "get_user_stats":
              return await this.getUserStats(args);
            case "query_daily_checkins":
              return await this.queryDailyCheckins(args);
            default:
              throw new Error(`Unknown tool: ${name}`);
          }
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: `Error: ${error.message}`
              }
            ]
          };
        }
      });
    }

    async queryUsers(args) {
      const client = await pool.connect();
      try {
        let query = 'SELECT * FROM users';
        const params = [];

        if (args.user_id) {
          query += ' WHERE user_id = $1';
          params.push(args.user_id);
        }

        if (args.order_by) {
          query += ` ORDER BY ${args.order_by} DESC`;
        }

        query += ` LIMIT $${params.length + 1}`;
        params.push(args.limit || 10);

        const result = await client.query(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };
      } finally {
        client.release();
      }
    }

    async queryTransactions(args) {
      const client = await pool.connect();
      try {
        let query = 'SELECT * FROM transactions';
        const params = [];
        const conditions = [];

        if (args.user_id) {
          conditions.push(`(from_user_id = $${params.length + 1} OR to_user_id = $${params.length + 1})`);
          params.push(args.user_id);
        }

        if (args.type) {
          conditions.push(`type = $${params.length + 1}`);
          params.push(args.type);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(args.limit || 10);

        const result = await client.query(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };
      } finally {
        client.release();
      }
    }

    async getLeaderboard(args) {
      const client = await pool.connect();
      try {
        const orderBy = args.type || 'balance';
        const limit = args.limit || 10;

        const result = await client.query(
          `SELECT user_id, balance, total_earned FROM users
           WHERE balance > 0 OR total_earned > 0
           ORDER BY ${orderBy} DESC LIMIT $1`,
          [limit]
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };
      } finally {
        client.release();
      }
    }

    async getUserStats(args) {
      const client = await pool.connect();
      try {
        const userResult = await client.query(
          'SELECT * FROM users WHERE user_id = $1',
          [args.user_id]
        );

        const transactionResult = await client.query(
          'SELECT COUNT(*) as transaction_count FROM transactions WHERE from_user_id = $1 OR to_user_id = $1',
          [args.user_id]
        );

        const stats = {
          user: userResult.rows[0] || null,
          transaction_count: transactionResult.rows[0].transaction_count
        };

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2)
            }
          ]
        };
      } finally {
        client.release();
      }
    }

    async queryDailyCheckins(args) {
      const client = await pool.connect();
      try {
        let query = 'SELECT * FROM daily_checkins';
        const params = [];

        if (args.user_id) {
          query += ' WHERE user_id = $1';
          params.push(args.user_id);
        }

        if (args.order_by) {
          query += ` ORDER BY ${args.order_by} DESC`;
        } else {
          query += ' ORDER BY current_streak DESC';
        }

        query += ` LIMIT $${params.length + 1}`;
        params.push(args.limit || 10);

        const result = await client.query(query, params);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result.rows, null, 2)
            }
          ]
        };
      } finally {
        client.release();
      }
    }

    async run() {
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error("Database MCP Server running on stdio");
    }
  }

  // Start server
  const server = new DatabaseMCPServer();
  server.run().catch(console.error);