export function renderSkillBody(body: string, args: string): string {
  const trimmed = args.trim();
  const tokens = trimmed.length > 0 ? trimmed.split(/\s+/) : [];

  let rendered = body.replace(/\$ARGUMENTS\b/g, trimmed);

  rendered = rendered.replace(/\$(\d+)/g, (_match, idx: string) => {
    const i = parseInt(idx, 10) - 1;
    return tokens[i] ?? '';
  });

  return rendered;
}
