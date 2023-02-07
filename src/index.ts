import { fastify } from "fastify";
import { fastifyPostgres } from "@fastify/postgres";
import { fastifyEnv } from "@fastify/env";

const envSchema = {
  type: "object",
  required: ["DEFAULT_URL", "CONNECTION_STRING"],
  properties: {
    DEFAULT_URL: {
      type: "string",
    },
    CONNECTION_STRING: {
      type: "string",
    },
  },
};
const envOptions = {
  confKey: "config",
  schema: envSchema,
  dotenv: true,
  data: process.env,
};

const server = fastify();

const initialize = async () => {
  server.register(fastifyEnv, envOptions);
  await server.after();

  const DEFAULT_URL = server.config.DEFAULT_URL;

  server.register(fastifyPostgres, {
    connectionString: server.config.CONNECTION_STRING,
  });

  server.get<{ Params: { slug: string } }>("/:slug/", async (req, reply) => {
    try {
      const client = await server.pg.connect();
      const urlResult = await client.query<{ url: string }>(
        "SELECT url FROM urls WHERE slug=$1",
        [req.params.slug]
      );

      client.release();

      if (urlResult.rowCount === 0) {
        reply.redirect(301, DEFAULT_URL);
      } else {
        reply.redirect(301, urlResult?.rows?.[0]?.url);
      }
    } catch (error) {
      console.log(error);
      reply.redirect(301, DEFAULT_URL);
    }
  });
};
initialize();

(async () => {
  try {
    await server.ready();
    await server.listen({ port: 8080 });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
