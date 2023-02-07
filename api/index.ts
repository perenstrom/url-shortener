import { fastify, FastifyReply, FastifyRequest } from "fastify";
import { fastifyPostgres } from "@fastify/postgres";
import { fastifyEnv } from "@fastify/env";
import { VercelRequest, VercelResponse } from "@vercel/node";

declare module "fastify" {
  interface FastifyInstance {
    config: {
      DEFAULT_URL: string;
      CONNECTION_STRING: string;
    };
  }
}

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

interface Params {
  Params: { slug: string };
}

const handler =
  (defaultUrl: string) =>
  async (req: FastifyRequest<Params>, reply: FastifyReply) => {
    try {
      const client = await server.pg.connect();
      const urlResult = await client.query<{ url: string }>(
        "SELECT url FROM urls WHERE slug=$1",
        [req.params.slug]
      );

      client.release();

      if (urlResult.rowCount === 0) {
        reply.redirect(301, defaultUrl);
      } else {
        reply.redirect(301, urlResult?.rows?.[0]?.url);
      }
    } catch (error) {
      console.log(error);
      reply.redirect(301, defaultUrl);
    }
  };

const initialize = async () => {
  server.register(fastifyEnv, envOptions);
  await server.after();

  const DEFAULT_URL = server.config.DEFAULT_URL;

  server.register(fastifyPostgres, {
    connectionString: server.config.CONNECTION_STRING,
  });

  server.get<{ Params: { slug: string } }>("/api/:slug", handler(DEFAULT_URL));
  server.get<{ Params: { slug: string } }>("/api/:slug/", handler(DEFAULT_URL));
};
initialize();

export default async (req: VercelRequest, res: VercelResponse) => {
  try {
    await server.ready();
    server.server.emit("request", req, res);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
