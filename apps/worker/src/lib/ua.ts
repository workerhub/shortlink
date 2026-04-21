// Lightweight UA parser — no external dependencies, ~0.2ms per parse

interface ParsedUA {
  deviceType: 'mobile' | 'tablet' | 'desktop' | 'bot'
  browser: string
  os: string
}

const BOT_REGEX =
  /bot|crawler|spider|scraper|crawling|facebookexternalhit|linkedinbot|twitterbot|slackbot|whatsapp/i

export function parseUA(ua: string | null | undefined): ParsedUA {
  if (!ua) return { deviceType: 'desktop', browser: 'Unknown', os: 'Unknown' }

  if (BOT_REGEX.test(ua)) {
    return { deviceType: 'bot', browser: 'Bot', os: 'Bot' }
  }

  const isTablet = /iPad|Tablet|tablet/i.test(ua)
  const isMobile = !isTablet && /Mobile|Android|iPhone|iPod|BlackBerry|Windows Phone/i.test(ua)
  const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua) || /Opera/i.test(ua)
      ? 'Opera'
      : /SamsungBrowser\//i.test(ua)
        ? 'Samsung'
        : /Firefox\//i.test(ua)
          ? 'Firefox'
          : /Chrome\//i.test(ua)
            ? 'Chrome'
            : /Safari\//i.test(ua)
              ? 'Safari'
              : 'Other'

  const os = /Windows NT/i.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/i.test(ua)
      ? 'iOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /Mac OS X/i.test(ua)
          ? 'macOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Other'

  return { deviceType, browser, os }
}
