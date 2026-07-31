export function dcMovieTemplate(data) {
  return {
    embeds: [
      {
        description: 
          `# ${data.title}\n\n\n` +
          `### ${data.description}\n\n` +
          `# 🍿 \`Watch And Download Now 👇\` \n` +
          `##  Link 👉 __[Click Here to Watch And Download](${data.postLink})__\n\n` +
          `## 🌐 FOLLOW US\n` +
          `### 🔴 __[YouTube](https://youtube.com)__  •  💜 __[Discord](https://discord.com)__\n\n` +
          `\`\`\`© COPYRIGHT @ＢＤＨΞＸ【ＣＨΞΛＴ】 2022 - 2026\`\`\``,

        image: data.thumbnailUrl ? { url: data.thumbnailUrl } : undefined,

        color: 0xE74C3C 
      }
    ]
  };
}