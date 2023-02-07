declare module "fastify" {
  interface FastifyInstance {
    config: {
      // this should be same as the confKey in options
      DEFAULT_URL: string;
      CONNECTION_STRING: string;
    };
  }
}

export {};
