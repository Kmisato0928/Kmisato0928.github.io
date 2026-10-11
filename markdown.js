function node(tag, text) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  return value;
}

function inline(parent, text, onCitation) {
  const pattern = /(\u0060[^\u0060]+\u0060|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\[ID:\s*\d+\])/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    parent.append(document.createTextNode(text.slice(position, match.index)));
    const token = match[0];
    if (token.startsWith(String.fromCharCode(96))) parent.append(node("code", token.slice(1, -1)));
    else if (token.startsWith("**")) inline(parent.appendChild(node("strong")), token.slice(2, -2), onCitation);
    else if (token.startsWith("[ID:")) {
      const index = Number(token.match(/\d+/)[0]);
      const button = node("button", "[" + (index + 1) + "]");
      button.type = "button";
      button.className = "rag-citation";
      button.setAttribute("aria-label", "查看笔记出处 " + (index + 1));
      button.addEventListener("click", () => onCitation?.(index));
      parent.append(button);
    } else {
      const separator = token.indexOf("](");
      const link = node("a", token.slice(1, separator));
      link.href = token.slice(separator + 2, -1);
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      parent.append(link);
    }
    position = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(position)));
}

function tableCells(line) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

export function renderMarkdown(container, content, onCitation) {
  const text = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const fragment = document.createDocumentFragment();
  const tick = String.fromCharCode(96);
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    const isFence = line.trim().startsWith(tick.repeat(3)) || line.trim().startsWith("~~~");
    if (isFence) {
      const marker = line.trim().startsWith("~~~") ? "~~~" : tick.repeat(3);
      const codeLines = [];
      const language = line.trim().slice(marker.length).trim();
      index++;
      while (index < lines.length && !lines[index].trim().startsWith(marker)) codeLines.push(lines[index++]);
      if (index < lines.length) index++;
      const pre = node("pre");
      const code = node("code", codeLines.join("\n"));
      if (language) code.dataset.language = language;
      pre.append(code);
      fragment.append(pre);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const item = node("h" + Math.min(heading[1].length + 1, 6));
      inline(item, heading[2], onCitation);
      fragment.append(item);
      index++;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1])) {
      const wrapper = node("div");
      wrapper.className = "chat-table";
      const table = node("table");
      const header = node("tr");
      for (const cell of tableCells(line)) inline(header.appendChild(node("th")), cell, onCitation);
      const thead = node("thead");
      thead.append(header);
      table.append(thead);
      index += 2;
      const body = node("tbody");
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        const row = node("tr");
        for (const cell of tableCells(lines[index++])) inline(row.appendChild(node("td")), cell, onCitation);
        body.append(row);
      }
      table.append(body);
      wrapper.append(table);
      fragment.append(wrapper);
      continue;
    }
    const listMatch = line.match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
    if (listMatch) {
      const ordered = Boolean(listMatch[2]);
      const list = node(ordered ? "ol" : "ul");
      if (ordered) list.start = Number(listMatch[2]);
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:([-*+])|(\d+)[.)])\s+(.+)$/);
        if (!match || Boolean(match[2]) !== ordered) break;
        inline(list.appendChild(node("li")), match[3], onCitation);
        index++;
      }
      fragment.append(list);
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      const item = node("blockquote");
      inline(item, quote[1], onCitation);
      fragment.append(item);
      index++;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { fragment.append(node("hr")); index++; continue; }
    const paragraph = node("p");
    inline(paragraph, line, onCitation);
    fragment.append(paragraph);
    index++;
  }
  container.replaceChildren(fragment);
  container.classList.add("chat-answer");
}
