export async function readReply<T>(
  read: (value: T) => Promise<T> | T,
  value: T,
  _response?: Response,
): Promise<T> {
  return await read(value);
}
