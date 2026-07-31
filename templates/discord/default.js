export function dcDefaultTemplate(data) {
  return {
    embeds: [
      {
        title: `📌 ${data.title}`,
        url: data.postLink,
        description: data.description,
        color: 0x3498DB, // Blue Color
        image: data.thumbnailUrl ? { url: data.thumbnailUrl } : undefined,
        footer: {
          text: "Auto Poster Bot"
        }
      }
    ]
  };
}