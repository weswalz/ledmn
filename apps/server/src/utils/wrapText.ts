export function wrapMessage(text: string, maxChars: number): string {
  if (maxChars <= 0) {
    return text;
  }

  const lines: string[] = [];
  const sourceLines = text.split(/\r?\n/);

  for (const sourceLine of sourceLines) {
    const words = sourceLine.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      continue;
    }

    let current = "";

    for (const word of words) {
      if (!current) {
        if (word.length <= maxChars) {
          current = word;
          continue;
        }

        let remaining = word;
        while (remaining.length > maxChars) {
          lines.push(remaining.slice(0, maxChars));
          remaining = remaining.slice(maxChars);
        }
        current = remaining;
        continue;
      }

      const next = `${current} ${word}`;
      if (next.length <= maxChars) {
        current = next;
        continue;
      }

      lines.push(current);

      if (word.length <= maxChars) {
        current = word;
        continue;
      }

      let remaining = word;
      while (remaining.length > maxChars) {
        lines.push(remaining.slice(0, maxChars));
        remaining = remaining.slice(maxChars);
      }
      current = remaining;
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines.join("\n").trimEnd();
}
