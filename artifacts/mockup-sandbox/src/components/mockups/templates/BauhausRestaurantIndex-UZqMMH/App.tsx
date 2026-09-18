import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Circle, Triangle, Square, Star, Clock, Bike, ArrowUpRight,
  Quote, MapPin, ChevronDown, Sparkles, ArrowRight
} from 'lucide-react';

// ——— PALETTE (warm neutrals + warm-shifted bauhaus primaries, no pure black/white)
const C = {
  paper: '#EFE7D8',
  paperDeep: '#E4D9C5',
  ink: '#2B2520',
  inkSoft: '#5C5246',
  line: '#C9BBA3',
  red: '#C2401F',
  yellow: '#DEA31E',
  blue: '#33507A',
};

const RESTAURANTS = [
  {
    id: 1,
    name: 'Taverna Forno',
    cuisine: 'Italian',
    img: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&h=600&fit=crop',
    match: 98,
    rating: 4.9,
    reviews: 2841,
    time: '24–32',
    fee: '0.00',
    dish: 'Wood-fired margherita, 72-hr dough',
    quote: 'Mise predicted I\u2019d love this place before I knew it existed. Three orders a week now.',
    author: 'Dana K., orders weekly',
    shape: 'circle',
    accent: C.red,
  },
  {
    id: 2,
    name: 'Kanda Ramen Lab',
    cuisine: 'Japanese',
    img: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&h=600&fit=crop',
    match: 96,
    rating: 4.8,
    reviews: 1932,
    time: '18–26',
    fee: '1.50',
    dish: 'Tori paitan, 14-hr chicken broth',
    quote: 'The broth arrived at 71°C. The model knew my route, my building, my elevator wait.',
    author: 'Marcus T., 212 orders',
    shape: 'triangle',
    accent: C.yellow,
  },
  {
    id: 3,
    name: 'Sobre Mesa',
    cuisine: 'Mexican',
    img: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?w=800&h=600&fit=crop',
    match: 94,
    rating: 4.8,
    reviews: 3105,
    time: '21–29',
    fee: '0.99',
    dish: 'Birria tacos, consommé on the side',
    quote: 'Recommendations got sharper every week. It learned I hate cilantro without being told.',
    author: 'Priya S., orders 3×/week',
    shape: 'square',
    accent: C.blue,
  },
  {
    id: 4,
    name: 'Hana Omakase',
    cuisine: 'Japanese',
    img: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&h=600&fit=crop',
    match: 93,
    rating: 4.9,
    reviews: 1287,
    time: '32–40',
    fee: '2.50',
    dish: 'Chef\u2019s 12-piece nigiri set',
    quote: 'Delivery sushi I actually trust. The freshness scoring is not a gimmick — it\u2019s real.',
    author: 'Elena R., food editor',
    shape: 'circle',
    accent: C.blue,
  },
  {
    id: 5,
    name: 'Brik & Mortar',
    cuisine: 'American',
    img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800&h=600&fit=crop',
    match: 91,
    rating: 4.7,
    reviews: 4519,
    time: '15–22',
    fee: '0.00',
    dish: 'Dry-aged smash burger, duck-fat fries',
    quote: 'Fries still crisp after a 19-minute ride. Whatever the routing model is doing — keep doing it.',
    author: 'Jordan M., 87 orders',
    shape: 'triangle',
    accent: C.red,
  },
  {
    id: 6,
    name: 'Cardamom House',
    cuisine: 'Indian',
    img: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800&h=600&fit=crop',
    match: 90,
    rating: 4.8,
    reviews: 2210,
    time: '26–34',
    fee: '1.25',
    dish: 'Lamb rogan josh, charcoal naan',
    quote: 'Spice level calibration is uncanny. It remembered my "medium-plus" from one comment.',
    author: 'Aisha B., orders monthly',
    shape: 'square',
    accent: C.yellow,
  },
  {
    id: 7,
    name: 'Verde Comune',
    cuisine: 'Salads',
    img: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800&h=600&fit=crop',
    match: 88,
    rating: 4.6,
    reviews: 1764,
    time: '12–18',
    fee: '0.00',
    dish: 'Charred broccolini grain bowl',
    quote: 'Lunch sorted in two taps. The reorder predictions are scarily on time — 11:47am, every day.',
    author: 'Tom W., daily lunch',
    shape: 'circle',
    accent: C.yellow,
  },
  {
    id: 8,
    name: 'Pasta Madre',
    cuisine: 'Italian',
    img: 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=800&h=600&fit=crop',
    match: 87,
    rating: 4.7,
    reviews: 1523,
    time: '28–36',
    fee: '1.99',
    dish: 'Hand-rolled pici, brown-butter sage',
    quote: 'Found via the "similar texture profile" rail. Now it\u2019s my Sunday ritual. Remarkable.',
    author: 'Camille D., 64 orders',
    shape: 'triangle',
    accent: C.blue,
  },
];

const CUISINES = ['All', 'Italian', 'Japanese', 'Mexican', 'American', 'Indian', 'Salads'];

const STATS = [
  { value: '4.86', label: 'Avg. rating across 1,200 partner kitchens', accent: C.red },
  { value: '96.2%', label: 'On-time deliveries, trailing 90 days', accent: C.yellow },
  { value: '2.4M', label: 'Orders matched by the Mise model', accent: C.blue },
];

function ShapeMark({ shape, color, size = 14 }) {
  if (shape === 'circle') return <span style={{ width: size, height: size, borderRadius: '50%', background: color, display: 'inline-block' }} />;
  if (shape === 'square') return <span style={{ width: size, height: size, background: color, display: 'inline-block' }} />;
  return (
    <span style={{
      width: 0, height: 0, display: 'inline-block',
      borderLeft: `${size / 2}px solid transparent`,
      borderRight: `${size / 2}px solid transparent`,
      borderBottom: `${size}px solid ${color}`,
    }} />
  );
}

export default function App() {
  const [cuisine, setCuisine] = useState('All');
  const [sortBy, setSortBy] = useState('match');

  const list = useMemo(() => {
    let r = cuisine === 'All' ? RESTAURANTS : RESTAURANTS.filter(x => x.cuisine === cuisine);
    return [...r].sort((a, b) => sortBy === 'match' ? b.match - a.match : b.rating - a.rating);
  }, [cuisine, sortBy]);

  return (
    <div style={{ background: C.paper, color: C.ink, minHeight: '100vh', fontFamily: "'Archivo', sans-serif" }}>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..900&family=Archivo+Black&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: `
        * { box-sizing: border-box; }
        ::selection { background: ${C.yellow}; color: ${C.ink}; }
        body { margin: 0; }
        .display-xl {
          font-family: 'Archivo Black', sans-serif;
          font-size: clamp(80px, 14.5vw, 230px);
          line-height: 0.8;
          letter-spacing: -0.03em;
          text-transform: uppercase;
        }
        .mono { font-family: 'Space Mono', monospace; }
        .card-img { filter: saturate(0.92) contrast(1.02); transition: transform .6s cubic-bezier(.2,.8,.2,1); }
        .r-card:hover .card-img { transform: scale(1.05); }
        .r-card { transition: background .25s; }
        .r-card:hover { background: ${C.paperDeep}; }
        .r-card:hover .order-cta { background: ${C.ink}; color: ${C.paper}; }
        .chip { transition: all .2s; cursor: pointer; }
        .chip:hover { transform: translateY(-1px); }
        .marquee-track { display: flex; gap: 0; animation: marquee 28s linear infinite; width: max-content; }
        @keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .noise::after {
          content: ''; position: fixed; inset: 0; pointer-events: none; opacity: .35; z-index: 50;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type='table' tableValues='0 0.04'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }
        .scrollbar-none::-webkit-scrollbar { display: none; }
      `}} />

      <div className="noise" />

      {/* ——— TOP NAV ——— */}
      <header className="sticky top-0 z-40" style={{ background: C.paper, borderBottom: `2px solid ${C.ink}` }}>
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-[3px]">
              <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.red }} />
              <span style={{ width: 16, height: 16, background: C.yellow }} />
              <span style={{ width: 0, height: 0, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: `16px solid ${C.blue}` }} />
            </div>
            <span className="font-black uppercase tracking-tight text-xl" style={{ fontFamily: "'Archivo Black'" }}>Mise</span>
            <span className="mono text-[10px] uppercase tracking-[0.2em] hidden md:inline-block px-2 py-1" style={{ border: `1.5px solid ${C.ink}` }}>delivery, modeled</span>
          </div>
          <div className="flex items-center gap-5">
            <button className="hidden md:flex items-center gap-2 mono text-xs uppercase tracking-wider hover:opacity-70">
              <MapPin size={14} strokeWidth={2.5} /> Brooklyn, NY <ChevronDown size={12} />
            </button>
            <button className="mono text-xs uppercase tracking-wider px-4 py-2 font-bold" style={{ background: C.ink, color: C.paper }}>
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* ——— HERO / DISPLAY TYPE ——— */}
      <section className="relative overflow-hidden" style={{ borderBottom: `2px solid ${C.ink}` }}>
        {/* Kandinsky composition */}
        <div className="absolute right-0 top-0 bottom-0 w-[42%] hidden lg:block pointer-events-none" aria-hidden>
          <div className="absolute" style={{ width: 280, height: 280, borderRadius: '50%', background: C.yellow, right: '12%', top: '6%' }} />
          <div className="absolute" style={{ width: 280, height: 280, borderRadius: '50%', border: `3px solid ${C.ink}`, right: '9%', top: '10%' }} />
          <div className="absolute" style={{ width: 150, height: 150, background: C.red, right: '32%', bottom: '14%', transform: 'rotate(12deg)' }} />
          <div className="absolute" style={{ width: 0, height: 0, borderLeft: '90px solid transparent', borderRight: '90px solid transparent', borderBottom: `160px solid ${C.blue}`, right: '6%', bottom: '8%', transform: 'rotate(-8deg)' }} />
          <div className="absolute" style={{ width: 340, height: 3, background: C.ink, right: '4%', top: '46%', transform: 'rotate(-32deg)' }} />
          <div className="absolute" style={{ width: 220, height: 3, background: C.ink, right: '20%', top: '62%', transform: 'rotate(18deg)' }} />
          <div className="absolute" style={{ width: 44, height: 44, borderRadius: '50%', background: C.ink, right: '40%', top: '20%' }} />
          <div className="absolute" style={{ width: 18, height: 18, borderRadius: '50%', background: C.red, right: '7%', top: '58%' }} />
        </div>

        <div className="max-w-[1440px] mx-auto px-5 md:px-10 pt-12 md:pt-16 pb-10 relative">
          <div className="mono text-xs uppercase tracking-[0.25em] mb-6 flex items-center gap-3" style={{ color: C.inkSoft }}>
            <span style={{ width: 8, height: 8, background: C.red, display: 'inline-block' }} />
            Restaurant index · curated by the Mise recommendation model · v4.2
          </div>

          <h1 className="display-xl">
            <span className="block">Every</span>
            <span className="block" style={{ color: C.red }}>Order,</span>
            <span className="block">Exact.</span>
          </h1>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            <p className="md:col-span-5 text-base md:text-lg leading-snug font-medium max-w-md" style={{ color: C.inkSoft }}>
              1,200 kitchens, ranked nightly by a model trained on 2.4 million deliveries.
              Below — the restaurants our customers can&rsquo;t stop talking about.
            </p>
            <div className="md:col-span-7 grid grid-cols-3 gap-px" style={{ background: C.ink, border: `2px solid ${C.ink}` }}>
              {STATS.map((s, i) => (
                <div key={i} className="p-4 md:p-5" style={{ background: C.paper }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ width: 10, height: 10, background: s.accent, borderRadius: i === 0 ? '50%' : 0 }} />
                  </div>
                  <div className="font-black text-2xl md:text-4xl tracking-tight" style={{ fontFamily: "'Archivo Black'" }}>{s.value}</div>
                  <div className="mono text-[10px] uppercase tracking-wider mt-1 leading-tight" style={{ color: C.inkSoft }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ——— TESTIMONIAL MARQUEE ——— */}
      <div className="overflow-hidden py-3" style={{ background: C.ink, color: C.paper }}>
        <div className="marquee-track">
          {[0, 1].map(k => (
            <div key={k} className="flex items-center shrink-0">
              {[
                '“The most precise delivery experience in the city” — The Borough Ledger',
                '“Predictions that border on telepathy” — TasteWire',
                '4.9★ App Store · 38,000 reviews',
                '“Form follows flavor” — Kitchen Quarterly',
                '“On time. Every time. Measured to the minute.” — D. Okafor, subscriber',
              ].map((t, i) => (
                <span key={i} className="mono text-xs uppercase tracking-[0.15em] flex items-center">
                  <span className="px-8">{t}</span>
                  <span style={{ width: 8, height: 8, background: [C.red, C.yellow, C.blue][i % 3], borderRadius: i % 2 ? '50%' : 0 }} />
                </span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ——— FILTERS ——— */}
      <section className="sticky top-16 z-30" style={{ background: C.paper, borderBottom: `2px solid ${C.ink}` }}>
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-3 flex items-center justify-between gap-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-none">
            {CUISINES.map(c => {
              const active = c === cuisine;
              return (
                <button
                  key={c}
                  onClick={() => setCuisine(c)}
                  className="chip mono text-xs uppercase tracking-wider px-4 py-2 whitespace-nowrap font-bold"
                  style={{
                    border: `2px solid ${C.ink}`,
                    background: active ? C.red : 'transparent',
                    color: active ? C.paper : C.ink,
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
          <div className="hidden md:flex items-center gap-2 shrink-0">
            <span className="mono text-[10px] uppercase tracking-[0.2em]" style={{ color: C.inkSoft }}>Sort</span>
            {[['match', 'AI match'], ['rating', 'Rating']].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSortBy(k)}
                className="mono text-xs uppercase tracking-wider px-3 py-2 font-bold"
                style={{
                  border: `2px solid ${C.ink}`,
                  background: sortBy === k ? C.ink : 'transparent',
                  color: sortBy === k ? C.paper : C.ink,
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ——— LISTING ——— */}
      <main className="max-w-[1440px] mx-auto px-5 md:px-10 py-10">
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="font-black uppercase text-2xl md:text-3xl tracking-tight" style={{ fontFamily: "'Archivo Black'" }}>
            {cuisine === 'All' ? 'Top rated near you' : `${cuisine} — top rated`}
          </h2>
          <span className="mono text-xs uppercase tracking-wider" style={{ color: C.inkSoft }}>{list.length} kitchens</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-px" style={{ background: C.ink, border: `2px solid ${C.ink}` }}>
          <AnimatePresence mode="popLayout">
            {list.map((r, idx) => (
              <motion.article
                layout
                key={r.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.03 }}
                className="r-card flex flex-col cursor-pointer"
                style={{ background: C.paper }}
              >
                {/* image */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '4/3', borderBottom: `2px solid ${C.ink}` }}>
                  <img src={r.img} alt={r.name} className="card-img w-full h-full object-cover" />
                  <div className="absolute top-0 left-0 mono text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 flex items-center gap-1.5"
                    style={{ background: r.accent, color: C.paper }}>
                    <Sparkles size={12} strokeWidth={2.5} /> {r.match}% match
                  </div>
                  <div className="absolute bottom-0 right-0 mono text-[11px] font-bold px-3 py-1.5 flex items-center gap-1.5"
                    style={{ background: C.paper, borderTop: `2px solid ${C.ink}`, borderLeft: `2px solid ${C.ink}` }}>
                    <Clock size={12} strokeWidth={2.5} /> {r.time} min
                  </div>
                </div>

                {/* body */}
                <div className="p-4 flex flex-col gap-3 grow">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShapeMark shape={r.shape} color={r.accent} size={12} />
                        <h3 className="font-black uppercase text-lg leading-none tracking-tight" style={{ fontFamily: "'Archivo Black'" }}>{r.name}</h3>
                      </div>
                      <p className="mono text-[11px] uppercase tracking-wider mt-1.5" style={{ color: C.inkSoft }}>{r.dish}</p>
                    </div>
                    <span className="mono text-[10px] uppercase tracking-wider px-2 py-1 shrink-0" style={{ border: `1.5px solid ${C.ink}` }}>{r.cuisine}</span>
                  </div>

                  <div className="flex items-center gap-4 mono text-xs font-bold">
                    <span className="flex items-center gap-1"><Star size={13} fill={C.yellow} color={C.ink} strokeWidth={1.5} /> {r.rating} <span style={{ color: C.inkSoft, fontWeight: 400 }}>({r.reviews.toLocaleString()})</span></span>
                    <span className="flex items-center gap-1"><Bike size={13} strokeWidth={2.5} /> {r.fee === '0.00' ? 'Free' : `$${r.fee}`}</span>
                  </div>

                  {/* testimonial */}
                  <figure className="mt-1 p-3 grow" style={{ background: C.paperDeep, borderLeft: `4px solid ${r.accent}` }}>
                    <Quote size={14} style={{ color: r.accent }} fill={r.accent} />
                    <blockquote className="text-[13px] leading-snug font-medium mt-1.5">{r.quote}</blockquote>
                    <figcaption className="mono text-[10px] uppercase tracking-wider mt-2" style={{ color: C.inkSoft }}>— {r.author}</figcaption>
                  </figure>

                  <button className="order-cta mt-1 flex items-center justify-between mono text-xs font-bold uppercase tracking-wider px-3 py-2.5 transition-colors"
                    style={{ border: `2px solid ${C.ink}`, color: C.ink }}>
                    Order from {r.name.split(' ')[0]} <ArrowUpRight size={14} strokeWidth={2.5} />
                  </button>
                </div>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      </main>

      {/* ——— BIG CLOSING TESTIMONIAL ——— */}
      <section style={{ borderTop: `2px solid ${C.ink}`, background: C.paperDeep }}>
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-8">
            <div className="flex items-center gap-2 mb-6">
              {[C.red, C.yellow, C.blue].map((c, i) => <Star key={i} size={20} fill={c} color={C.ink} strokeWidth={1.5} />)}
              {[C.red, C.yellow].map((c, i) => <Star key={i + 3} size={20} fill={c} color={C.ink} strokeWidth={1.5} />)}
            </div>
            <p className="font-black uppercase tracking-tight leading-[0.95] text-3xl md:text-5xl" style={{ fontFamily: "'Archivo Black'" }}>
              &ldquo;Mise treats a delivery the way a chef treats a plate — <span style={{ color: C.red }}>nothing arrives by accident</span>.&rdquo;
            </p>
            <p className="mono text-xs uppercase tracking-[0.2em] mt-6" style={{ color: C.inkSoft }}>
              — Reina Ortiz · Subscriber since 2022 · 412 orders, 0 refunds requested
            </p>
          </div>
          <div className="lg:col-span-4 flex flex-col justify-end gap-3">
            <button className="flex items-center justify-between px-5 py-4 mono text-sm font-bold uppercase tracking-wider"
              style={{ background: C.ink, color: C.paper }}>
              Download Mise <ArrowRight size={16} strokeWidth={2.5} />
            </button>
            <button className="flex items-center justify-between px-5 py-4 mono text-sm font-bold uppercase tracking-wider"
              style={{ border: `2px solid ${C.ink}` }}>
              Read 38,000 reviews <ArrowUpRight size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </section>

      {/* ——— FOOTER ——— */}
      <footer style={{ borderTop: `2px solid ${C.ink}` }}>
        <div className="max-w-[1440px] mx-auto px-5 md:px-10 py-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: C.red }} />
            <span style={{ width: 10, height: 10, background: C.yellow }} />
            <span style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `10px solid ${C.blue}` }} />
            <span className="mono text-[11px] uppercase tracking-[0.2em] ml-2" style={{ color: C.inkSoft }}>Mise Labs, Inc. · Built with obsessive care in Brooklyn</span>
          </div>
          <span className="mono text-[11px] uppercase tracking-[0.2em]" style={{ color: C.inkSoft }}>Model v4.2 · Last index rebuild 03:00 EST</span>
        </div>
      </footer>
    </div>
  );
}