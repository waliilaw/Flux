#!/usr/bin/env node

import { createSigner, message, spawn, result } from "@permaweb/aoconnect";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import Arweave from "arweave";
import { z } from "zod";
function cleanOutput(result2) {
  if (!result2) return "";
  return JSON.stringify(result2, null, 2)
    .replace(/\\u001b\[\d+m/g, "")
    .replace(/\\n/g, "\n");
}
var server = new McpServer({
  name: "ao-mcp",
  version: "1.0.0",
});
var arweave = Arweave.init({
  host: "arweave.net",
  port: 443,
  protocol: "https",
});
var wallet = await arweave.wallets.generate();
var signer = createSigner(wallet);
server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}));
server.tool(
  "spawn",
  {
    tags: z.array(
      z.object({
        name: z.string(),
        value: z.string(),
      })
    ),
    needsSqlite: z.boolean().optional(),
  },
  async ({ tags, needsSqlite }) => {
    const processId = await spawn({
      module: needsSqlite
        ? "33d-3X8mpv6xYBlVB-eXMrPfH5Kzf6Hiwhcv0UA10sw"
        : "JArYBF-D8q2OmZ4Mok00sD2Y_6SYEQ7Hjx-6VZ_jl3g",
      signer,
      scheduler: "_GQ33BkPtZrqxA84vM8Zk-N2aO0toNNu_C-l-rawrBA",
      tags,
    });
    return {
      content: [{ type: "text", text: processId }],
    };
  }
);
server.tool(
  "send-message-to-process",
  {
    processId: z.string(),
    data: z.string(),
    tags: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  },
  async ({ processId, data, tags }) => {
    const messageId = await message({
      process: processId,
      signer,
      data,
      tags,
    });
    await sleep(100);
    const output = await result({
      message: messageId,
      process: processId,
    });
    if (output.Error) {
      return {
        content: [{ type: "text", text: cleanOutput(output.Error) }],
      };
    }
    return {
      content: [{ type: "text", text: cleanOutput(output.Messages[0].Data) }],
    };
  }
);
async function installPackage(packageName, processId) {
  const code = `apm.install("${packageName}")`;
  const result2 = await runLuaCode(code, processId);
  return result2;
}
server.tool(
  "apm-install",
  { packageName: z.string(), processId: z.string() },
  async ({ packageName, processId }) => {
    const result2 = await installPackage(packageName, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "load-token-blueprint",
  { processId: z.string() },
  async ({ processId }) => {
    const result2 = await addBlueprint("token", processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "create-sqlite-based-handler",
  { processId: z.string(), handlerCode: z.string() },
  async ({ processId, handlerCode }) => {
    const code = `local sqlite = require('lsqlite3')
Db = sqlite.open_memory()
${handlerCode}`;
    const result2 = await runLuaCode(code, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "transaction",
  { transactionId: z.string() },
  async ({ transactionId }) => {
    try {
      const metadataResponse = await fetch(
        `https://arweave.net/tx/${transactionId}`
      );
      const metadata = await metadataResponse.json();
      const dataResponse = await fetch(
        `https://arweave.net/raw/${transactionId}`
      );
      const data = await dataResponse.text();
      const transactionInfo = {
        id: metadata.id,
        owner: metadata.owner,
        recipient: metadata.target,
        quantity: metadata.quantity,
        fee: metadata.reward,
        data_size: metadata.data_size,
        data: data.substring(0, 1e3),
        tags: metadata.tags || [],
      };
      return {
        content: [{ type: "text", text: cleanOutput(transactionInfo) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);
async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function runLuaCode(code, processId, tags) {
  const messageId = await message({
    process: processId,
    signer,
    data: code,
    tags: [{ name: "Action", value: "Eval" }, ...(tags || [])],
  });
  await sleep(100);
  const outputResult = await result({
    message: messageId,
    process: processId,
  });
  if (outputResult.Error) {
    return JSON.stringify(outputResult.Error);
  }
  return JSON.stringify(outputResult.Output.data);
}
async function fetchBlueprintCode(url) {
  const response = await fetch(url);
  const code = await response.text();
  return code;
}
async function listHandlers(processId) {
  const messageId = await message({
    process: processId,
    signer,
    data: `
      local handlers = Handlers.list
      local result = {}
      for i, handler in ipairs(handlers) do
        table.insert(result, {
          name = handler.name,
          type = type(handler.pattern),
        })
      end
      return result
    `,
    tags: [{ name: "Action", value: "Eval" }],
  });
  const outputResult = await result({
    message: messageId,
    process: processId,
  });
  if (outputResult.Error) {
    return outputResult.Error;
  }
  return outputResult.Output.data;
}
async function addHandler(processId, handlerCode) {
  const messageId = await message({
    process: processId,
    signer,
    data: handlerCode,
    tags: [{ name: "Action", value: "Eval" }],
  });
  await sleep(100);
  const outputResult = await result({
    message: messageId,
    process: processId,
  });
  return outputResult.Output
    ? outputResult.Output.data
    : outputResult.Messages[0].Data;
}
async function runHandler(processId, handlerName, data) {
  const messageId = await message({
    process: processId,
    signer,
    data,
    tags: [{ name: "Action", value: handlerName }],
  });
  await sleep(100);
  const outputResult = await result({
    message: messageId,
    process: processId,
  });
  return outputResult;
}
server.tool(
  "run-lua-in-process",
  {
    code: z.string(),
    processId: z.string(),
    tags: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      )
      .optional(),
  },
  async ({ code, processId, tags }) => {
    const result2 = await runLuaCode(code, processId, tags);
    return {
      content: [
        {
          type: "text",
          text: cleanOutput(result2),
        },
      ],
    };
  }
);
server.tool(
  "load-blueprint",
  { url: z.string(), processId: z.string() },
  async ({ url, processId }) => {
    const code = await fetchBlueprintCode(url);
    const result2 = await runLuaCode(code, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "load-local-blueprint",
  { blueprintCode: z.string(), processId: z.string() },
  async ({ blueprintCode, processId }) => {
    const result2 = await runLuaCode(blueprintCode, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
async function addBlueprint(blueprintName, processId) {
  const url = `https://raw.githubusercontent.com/permaweb/aos/refs/heads/main/blueprints/${blueprintName}.lua`;
  const code = await fetchBlueprintCode(url);
  const result2 = await runLuaCode(code, processId);
  return result2;
}
server.tool(
  "load-official-blueprint",
  { blueprintName: z.string(), processId: z.string() },
  async ({ blueprintName, processId }) => {
    const result2 = await addBlueprint(blueprintName, processId);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "list-available-handlers",
  { processId: z.string() },
  async ({ processId }) => {
    const handlers = await listHandlers(processId);
    return {
      content: [{ type: "text", text: cleanOutput(handlers) }],
    };
  }
);
server.tool(
  "create-handler",
  { processId: z.string(), handlerCode: z.string() },
  async ({ processId, handlerCode }) => {
    const result2 = await addHandler(processId, handlerCode);
    return {
      content: [{ type: "text", text: cleanOutput(result2) }],
    };
  }
);
server.tool(
  "run-handler-using-handler-name",
  { processId: z.string(), handlerName: z.string(), data: z.string() },
  async ({ processId, handlerName, data }) => {
    const result2 = await runHandler(processId, handlerName, data);
    if (result2.Error) {
      return {
        content: [{ type: "text", text: cleanOutput(result2.Error) }],
      };
    }
    return {
      content: [{ type: "text", text: cleanOutput(result2.Messages[0].Data) }],
    };
  }
);

// Basic arweave integrastion for now ,.,.,..,(1st version)

//  Upload Data Tool
// Add Arweave upload tool
server.tool(
  "upload-to-arweave",
  {
    content: z.string(),
    type: z.string().optional(),
  },
  async ({ content, type }) => {
    try {
      // Determine content type if not provided
      let contentType = type || "text/plain";
      
      const transaction = await arweave.createTransaction({
        data: Buffer.from(content),
      });
      
      transaction.addTag('Content-Type', contentType);
      transaction.addTag('App-Name', 'Cursor-Arweave');
      
      await arweave.transactions.sign(transaction, wallet);
      await arweave.transactions.post(transaction);
      
      return {
        content: [{ 
          type: "text", 
          text: `Text uploaded successfully!\nTransaction ID: ${transaction.id}\nContent Type: ${contentType}` 
        }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error uploading data: ${error?.message || String(error)}` },
        ],
      };
    }
  }
  );


// GraphQL Query Tool
server.tool(
  "query-arweave",
  {
    query: z.string(),
    variables: z.record(z.any()).optional()
  },
  async ({ query, variables }) => {
    try {
      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
      const result = await response.json();
      return {
        content: [{ type: "text", text: cleanOutput(result) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);

// Bundle Upload Tool
server.tool(
  "bundle-upload",
  {
    items: z.array(z.object({
      data: z.string(),
      tags: z.array(z.object({
        name: z.string(),
        value: z.string()
      })).optional()
    }))
  },
  async ({ items }) => {
    try {
      const transactions = await Promise.all(
        items.map(async item => {
          const tx = await arweave.createTransaction({
            data: Buffer.from(item.data)
          });
          if (item.tags) {
            item.tags.forEach(tag => tx.addTag(tag.name, tag.value));
          }
          await arweave.transactions.sign(tx, wallet);
          return tx;
        })
      );

      await Promise.all(transactions.map(tx => arweave.transactions.post(tx)));

      return {
        content: [{ 
          type: "text", 
          text: `Successfully uploaded ${transactions.length} items.\nTransaction IDs:\n${transactions.map(tx => tx.id).join('\n')}` 
        }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);

// Smart Contract Interaction Tool
server.tool(
  "interact-contract",
  {
    contractId: z.string(),
    input: z.string(),
    tags: z.array(z.object({
      name: z.string(),
      value: z.string()
    })).optional()
  },
  async ({ contractId, input, tags }) => {
    try {
      const transaction = await arweave.createTransaction({
        target: contractId,
        data: Buffer.from(input)
      });

      if (tags) {
        tags.forEach(tag => transaction.addTag(tag.name, tag.value));
      }

      await arweave.transactions.sign(transaction, wallet);
      await arweave.transactions.post(transaction);

      return {
        content: [{ 
          type: "text", 
          text: `Contract interaction successful!\nTransaction ID: ${transaction.id}` 
        }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);

// Wallet Management Tool
server.tool(
  "manage-wallet",
  {
    action: z.enum(["create", "balance", "last-tx"]),
    address: z.string().optional()
  },
  async ({ action, address }) => {
    try {
      switch (action) {
        case "create": {
          const newWallet = await arweave.wallets.generate();
          const address = await arweave.wallets.jwkToAddress(newWallet);
          return {
            content: [{ 
              type: "text", 
              text: `New wallet created!\nAddress: ${address}` 
            }],
          };
        }
        case "balance": {
          if (!address) throw new Error("Address required for balance check");
          const balance = await arweave.wallets.getBalance(address);
          const ar = arweave.ar.winstonToAr(balance);
          return {
            content: [{ 
              type: "text", 
              text: `Wallet Balance:\n${ar} AR\n${balance} Winston` 
            }],
          };
        }
        case "last-tx": {
          if (!address) throw new Error("Address required for transaction check");
          const query = `
            query {
              transactions(
                owners: ["${address}"],
                first: 1
              ) {
                edges {
                  node {
                    id
                    recipient
                    quantity
                    tags {
                      name
                      value
                    }
                  }
                }
              }
            }
          `;
          const response = await fetch('https://arweave.net/graphql', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
          });
          const result = await response.json();
          return {
            content: [{ type: "text", text: cleanOutput(result) }],
          };
        }
        default:
          throw new Error("Invalid action");
      }
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);

// Data Search Tool
server.tool(
  "search-arweave",
  {
    tags: z.array(z.object({
      name: z.string(),
      values: z.array(z.string())
    })),
    limit: z.number().optional()
  },
  async ({ tags, limit = 10 }) => {
    try {
      const tagFilters = tags.map(tag => `
        {
          name: "${tag.name}",
          values: ${JSON.stringify(tag.values)}
        }
      `).join(',');

      const query = `
        query {
          transactions(
            tags: [${tagFilters}],
            first: ${limit}
          ) {
            edges {
              node {
                id
                owner {
                  address
                }
                data {
                  size
                }
                tags {
                  name
                  value
                }
              }
            }
          }
        }
      `;

      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      const result = await response.json();
      return {
        content: [{ type: "text", text: cleanOutput(result) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "text", text: `Error: ${error?.message || String(error)}` },
        ],
      };
    }
  }
);



var transport = new StdioServerTransport();
await server.connect(transport);
