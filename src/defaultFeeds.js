// Default feed list seeded into the database on first run.
// After seeding, feeds are managed via the UI / API and persisted in SQLite.
//
// Each feed declares its category. The article's category is inherited from
// its source feed — we no longer try to keyword-classify individual articles.
// Allowed categories: science, ai, maker, gaming, ios, apple, tech, radio,
// green, birding, weather, general.
const DEFAULT_FEEDS = [
  // Science
  { label: "Phys.org", url: "https://phys.org/rss-feed/", category: "science" },
  { label: "Phys.org Physics", url: "https://phys.org/rss-feed/physics-news/", category: "science" },
  { label: "Phys.org Chemistry", url: "https://phys.org/rss-feed/chemistry-news/", category: "science" },
  { label: "Quanta Magazine", url: "https://www.quantamagazine.org/feed/", category: "science" },
  { label: "ScienceDaily All News", url: "https://www.sciencedaily.com/rss/all.xml", category: "science" },
  { label: "ScienceDaily Top Science", url: "https://www.sciencedaily.com/rss/top/science.xml", category: "science" },
  { label: "ScienceDaily Environment", url: "https://www.sciencedaily.com/rss/earth_climate.xml", category: "science" },
  { label: "ScienceAlert", url: "https://www.sciencealert.com/rss", category: "science" },
  { label: "Science News", url: "https://www.sciencenews.org/feed", category: "science" },
  { label: "Live Science", url: "https://www.livescience.com/feeds/all", category: "science" },
  { label: "Space.com", url: "https://www.space.com/feeds/all", category: "science" },
  { label: "EOS (AGU)", url: "https://eos.org/feed", category: "science" },
  { label: "PLOS Biology", url: "https://journals.plos.org/plosbiology/feed/atom", category: "science" },
  { label: "NASA Breaking News", url: "https://www.nasa.gov/rss/dyn/breaking_news.rss", category: "science" },
  { label: "MIT Research News", url: "https://news.mit.edu/rss/research", category: "science" },

  // AI / Machine learning
  { label: "DeepMind", url: "https://deepmind.com/blog/feed/basic/", category: "ai" },
  { label: "OpenAI News", url: "https://openai.com/news/rss.xml", category: "ai" },
  { label: "Google AI Blog", url: "http://googleresearch.blogspot.com/atom.xml", category: "ai" },
  { label: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "ai" },
  { label: "Towards Data Science", url: "https://towardsdatascience.com/feed", category: "ai" },
  { label: "PyTorch", url: "https://pytorch.org/feed", category: "ai" },
  { label: "Jay Alammar", url: "https://jalammar.github.io/feed.xml", category: "ai" },
  { label: "ML@CMU", url: "https://blog.ml.cmu.edu/feed/", category: "ai" },

  // Maker / hobby electronics / Raspberry Pi
  { label: "Arduino", url: "https://blog.arduino.cc/feed/", category: "maker" },
  { label: "Hackaday", url: "https://hackaday.com/blog/feed/", category: "maker" },
  { label: "Adafruit", url: "https://blog.adafruit.com/feed/", category: "maker" },
  { label: "Make", url: "https://makezine.com/feed/", category: "maker" },
  { label: "Raspberry Pi Blog", url: "https://www.raspberrypi.org/blog/feed/", category: "maker" },
  { label: "Raspberry Pi News", url: "https://www.raspberrypi.com/news/feed/", category: "maker" },
  { label: "Jeff Geerling Blog", url: "https://www.jeffgeerling.com/blog.xml", category: "maker" },
  { label: "The Pi Hut", url: "https://thepihut.com/blogs/raspberry-pi-roundup.atom", category: "maker" },
  { label: "Hackaday Raspberry Pi", url: "https://hackaday.com/category/raspberry-pi-2/feed/", category: "maker" },
  { label: "pi3g.com Blog", url: "https://pi3g.com/feed/", category: "maker" },
  { label: "Pi My Life Up", url: "https://pimylifeup.com/category/projects/feed/", category: "maker" },
  { label: "RaspberryTips", url: "https://raspberrytips.com/feed/", category: "maker" },
  { label: "Alex Ellis' Blog", url: "https://blog.alexellis.io/rss/", category: "maker" },
  { label: "peppe8o", url: "https://peppe8o.com/feed/", category: "maker" },
  { label: "Stephen Smith Raspberry Pi", url: "https://smist08.wordpress.com/tag/raspberry-pi/feed/", category: "maker" },
  { label: "Raspberry Pi Spy", url: "https://www.raspberrypi-spy.co.uk/feed/", category: "maker" },
  { label: "Pimoroni", url: "https://blog.pimoroni.com/rss/", category: "maker" },
  { label: "Raspberry PiPod Blog", url: "https://www.recantha.co.uk/blog/?feed=rss2", category: "maker" },
  { label: "Circuit Specialists Raspberry Pi", url: "https://www.circuitspecialists.com/blog/category/single-board-computers/raspberry-pi/feed/", category: "maker" },
  { label: "SwitchDoc Labs", url: "https://www.switchdoc.com/category/raspberrypicat/feed/", category: "maker" },
  { label: "Ozzmaker", url: "https://ozzmaker.com/category/raspberry-pi/feed/", category: "maker" },
  { label: "PiCockpit", url: "https://picockpit.com/raspberry-pi/feed/", category: "maker" },
  { label: "Cat Lamin", url: "https://catlamin.com/category/education/raspberry-pi/feed/", category: "maker" },
  { label: "Embedded Lab", url: "https://embedded-lab.com/blog/category/raspberry-pie/feed/", category: "maker" },
  { label: "The Rantings of a Madman", url: "https://feeds.feedburner.com/TheRantingsAndRavingsOfAMadman", category: "maker" },
  { label: "FactoryForward", url: "https://www.factoryforward.com/category/raspberry-pi/feed/", category: "maker" },
  { label: "Raspberry Pi Tutorials", url: "https://www.raspberrypi.com/tutorials/feed/", category: "maker" },
  { label: "OpenSource.com Raspberry Pi", url: "https://opensource.com/taxonomy/term/7974/feed?intcmp=701f2000000h4RcAAI&src=raspberry_pi_resource_menu4", category: "maker" },
  { label: "Prusa Blog", url: "https://blog.prusa3d.com/feed/", category: "maker" },

  // Gaming
  { label: "IGN", url: "https://feeds.ign.com/ign/all", category: "gaming" },
  { label: "GameSpot", url: "https://www.gamespot.com/feeds/mashup/", category: "gaming" },
  { label: "Eurogamer", url: "https://www.eurogamer.net/feed", category: "gaming" },

  // Apple ecosystem (official + long-form editorial; ad-heavy “buying guide”
  // sites like MacRumors / 9to5Mac / AppleInsider / iMore are intentionally
  // excluded because they trigger the promotional-content filter frequently)
  { label: "Apple Newsroom", url: "https://www.apple.com/newsroom/rss-feed.rss", category: "apple" },
  { label: "Apple Developer News", url: "https://developer.apple.com/news/rss/news.rss", category: "apple" },
  { label: "Apple Machine Learning Research", url: "https://machinelearning.apple.com/rss.xml", category: "apple" },
  { label: "Swift Blog", url: "https://www.swift.org/atom.xml", category: "apple" },
  { label: "Daring Fireball", url: "https://daringfireball.net/feeds/main", category: "apple" },
  { label: "Six Colors", url: "https://sixcolors.com/feed/", category: "apple" },
  { label: "Michael Tsai", url: "https://mjtsai.com/blog/feed/", category: "apple" },
  { label: "The Eclectic Light Company", url: "https://eclecticlight.co/feed/", category: "apple" },
  { label: "Panic Blog", url: "https://panic.com/blog/feed/", category: "apple" },

  // iOS-specific
  { label: "iOS Dev Weekly", url: "https://iosdevweekly.com/issues.rss", category: "ios" },

  // Tech (general tech / engineering / homelab / self-hosted)
  { label: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech" },
  { label: "The Verge", url: "https://www.theverge.com/rss/index.xml", category: "tech" },
  { label: "Engadget", url: "https://www.engadget.com/rss.xml", category: "tech" },
  { label: "TechCrunch", url: "https://techcrunch.com/feed/", category: "tech" },
  { label: "Product Hunt", url: "http://www.producthunt.com/feed", category: "tech" },
  { label: "Hacker News", url: "http://news.ycombinator.com/rss", category: "tech" },
  { label: "GitHub Engineering", url: "http://githubengineering.com/atom.xml", category: "tech" },
  { label: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", category: "tech" },
  { label: "Dropbox Tech", url: "https://dropbox.tech/feed", category: "tech" },
  { label: "Slack Engineering", url: "https://slack.engineering/feed", category: "tech" },
  { label: "Spotify Engineering", url: "https://engineering.atspotify.com/feed/", category: "tech" },
  { label: "Docker Blog", url: "https://www.docker.com/blog/feed/", category: "tech" },
  { label: "selfh.st", url: "https://selfh.st/rss/", category: "tech" },
  { label: "Noted (Homelab)", url: "https://noted.lol/rss/", category: "tech" },
  { label: "LinuxServer.io", url: "https://www.linuxserver.io/blog/feed.xml", category: "tech" },
  { label: "Earthly Blog", url: "https://earthly.dev/blog/rss.xml", category: "tech" },
  { label: "Kubernetes Blog", url: "https://kubernetes.io/feed.xml", category: "tech" },
  { label: "Landchad", url: "https://landchad.net/rss.xml", category: "tech" },
  { label: "Jellyfin Blog", url: "https://jellyfin.org/index.xml", category: "tech" },
  { label: "Linux Mint Blog", url: "https://blog.linuxmint.com/?feed=rss2", category: "tech" },
  { label: "Home Assistant Blog", url: "https://www.home-assistant.io/atom.xml", category: "tech" },
  { label: "Pi-hole Blog", url: "https://pi-hole.net/blog/feed/", category: "tech" },
  { label: "Nextcloud Blog", url: "https://nextcloud.com/blog/feed/", category: "tech" },

  // Radio / shortwave / amateur
  { label: "The SWLing Post", url: "https://swling.com/blog/feed/", category: "radio" },
  { label: "AmateurRadio.com", url: "https://www.amateurradio.com/feed/", category: "radio" },
  { label: "Hackaday Radio Hacks", url: "https://hackaday.com/category/radio-hacks/feed/", category: "radio" },
  { label: "QRPer", url: "https://qrper.com/feed/", category: "radio" },

  // Birding / ornithology
  { label: "Cornell Lab — All About Birds", url: "https://www.allaboutbirds.org/news/feed/", category: "birding" },
  { label: "Audubon", url: "https://www.audubon.org/rss.xml", category: "birding" },

  // Weather
  { label: "WeatherFlow Blog", url: "https://blog.weatherflow.com/feed/", category: "weather" },

  // General good news
  { label: "Good News Network", url: "https://www.goodnewsnetwork.org/feed/", category: "general" },
  { label: "Positive News", url: "https://www.positive.news/feed/", category: "general" }
];

const FEED_CATEGORIES = [
  "science",
  "ai",
  "maker",
  "gaming",
  "ios",
  "apple",
  "tech",
  "radio",
  "green",
  "birding",
  "weather",
  "general"
];

const DEFAULT_FEED_CATEGORY = "general";

module.exports = { DEFAULT_FEEDS, FEED_CATEGORIES, DEFAULT_FEED_CATEGORY };
