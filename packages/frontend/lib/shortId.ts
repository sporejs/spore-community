const charSet =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const first = charSet[0];
const last = charSet[charSet.length - 1];
const nextMap: { [key: string]: string } = {};
for (let i = 0; i < charSet.length - 1; i++) {
  nextMap[charSet[i]] = charSet[i + 1];
}

export function nextId(a: string): string {
  if (!a) {
    return first;
  }

  const firstCh = a[0];
  const tail = a.substr(1);

  if (a[0] === last) {
    return first + nextId(tail);
  }

  return nextMap[firstCh] + tail;
}

export function generator() {
  let curr = '';
  return () => {
    curr = nextId(curr);
    return curr;
  };
}
