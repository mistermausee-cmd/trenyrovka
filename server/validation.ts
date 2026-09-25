import type { FastifyReply } from 'fastify';
import type { ZodType } from 'zod';

export function parseBody<T>(schema: ZodType<T>, input: unknown, reply: FastifyReply): T | null {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  void reply.code(400).send({
    error: 'validation_error',
    message: 'Проверьте заполненные поля',
    details: result.error.flatten().fieldErrors,
  });
  return null;
}
