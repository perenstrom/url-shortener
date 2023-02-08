import {
  fastify,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  RouteShorthandOptions,
} from "fastify";
import { fastifyPostgres } from "@fastify/postgres";
import { fastifyEnv } from "@fastify/env";
import { VercelRequest, VercelResponse } from "@vercel/node";
import { Static, Type } from "@sinclair/typebox";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { DatabaseError } from "pg";

declare module "fastify" {
  interface FastifyInstance {
    config: {
      DEFAULT_URL: string;
      CONNECTION_STRING: string;
      API_KEY: string;
    };
  }
}

const envSchema = {
  type: "object",
  required: ["DEFAULT_URL", "CONNECTION_STRING", "API_KEY"],
  properties: {
    DEFAULT_URL: {
      type: "string",
    },
    CONNECTION_STRING: {
      type: "string",
    },
    API_KEY: {
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

const server = fastify().withTypeProvider<TypeBoxTypeProvider>();

interface Params {
  Params: { slug: string };
}

const getHandler =
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

const BodySchema = Type.Object({
  apiKey: Type.String(),
  url: Type.String({ format: "uri" }),
});
type BodyType = Static<typeof BodySchema>;

const postHandler =
  (apiKey: string) =>
  async (
    req: FastifyRequest<{ Params: Params["Params"]; Body: BodyType }>,
    reply: FastifyReply
  ) => {
    try {
      if (req.body.apiKey !== apiKey) {
        reply.status(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "Wrong API key",
        });
      }

      const client = await server.pg.connect();
      const urlResult = await client.query<{ url: string }>(
        "INSERT INTO urls(slug, url) VALUES ($1, $2)",
        [req.params.slug, req.body.url]
      );

      client.release();

      if (urlResult.rowCount !== 0) {
        reply.status(201).send({ slug: req.params.slug, url: req.body.url });
      } else {
        reply.status(500).send({
          statusCode: 500,
          error: "Internal server error",
          message: "Unknown internal server error",
        });
      }
    } catch (error) {
      const DUPLICATE_KEY_ERROR_CODE = "23505";
      if (
        error instanceof DatabaseError &&
        error.code === DUPLICATE_KEY_ERROR_CODE
      ) {
        reply.status(400).send({
          statusCode: 400,
          error: "Bad Request",
          message: "Slug already registered",
        });
      }

      console.log(error);
      reply.status(500).send({
        statusCode: 500,
        error: "Internal server error",
        message: "Unknown internal server error",
      });
    }
  };

const initialize = async () => {
  server.register(fastifyEnv, envOptions);
  await server.after();

  const DEFAULT_URL = server.config.DEFAULT_URL;
  const API_KEY = server.config.API_KEY;

  server.register(fastifyPostgres, {
    connectionString: server.config.CONNECTION_STRING,
  });

  server.post<{ Params: { slug: string }; Body: BodyType }>(
    "/:slug",
    { schema: { body: BodySchema } },
    postHandler(API_KEY)
  );
  server.get<{ Params: { slug: string } }>("/:slug", getHandler(DEFAULT_URL));
  server.get<{ Params: { slug: string } }>("/:slug/", getHandler(DEFAULT_URL));
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
