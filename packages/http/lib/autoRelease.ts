export type CleanupFunc = () => void | Promise<void>;

const stack: CleanupFunc[] = [];

export function autoRelease(func: CleanupFunc) {
  if (func && typeof func === 'function') {
    stack.push(func);
  }
}

export async function releaseAll() {
  let item;
  while ((item = stack.pop())) {
    await item();
  }
}
