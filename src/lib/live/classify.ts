// Public issuer reference data used to tag reporting. Aliases are matched on word boundaries.
// Peers and themes form the exposure graph: a story about a peer or theme is an indirect connection.
type Company={name:string;aliases:string[];topics:string[];peers?:string[]};
export const COMPANIES:Record<string,Company>={
 NVDA:{name:'NVIDIA',aliases:['nvidia'],topics:['Semiconductors','AI'],peers:['AMD','AVGO','TSM','INTC','MRVL']},
 TSLA:{name:'Tesla',aliases:['tesla','elon musk'],topics:['Automotive'],peers:['GM','F','RIVN']},
 INTC:{name:'Intel',aliases:['intel'],topics:['Semiconductors','AI'],peers:['AMD','NVDA','TSM']},
 MRVL:{name:'Marvell',aliases:['marvell'],topics:['Semiconductors','AI','Cloud'],peers:['AVGO','NVDA']},
 AMZN:{name:'Amazon',aliases:['amazon','aws','amazon web services'],topics:['Cloud','Retail','AI'],peers:['MSFT','GOOGL','WMT']},
 AAPL:{name:'Apple',aliases:['apple inc','apple\'s','iphone','tim cook'],topics:['Consumer','AI'],peers:['MSFT','GOOGL']},
 MSFT:{name:'Microsoft',aliases:['microsoft','azure'],topics:['Cloud','AI'],peers:['GOOGL','AMZN','ORCL']},
 GOOGL:{name:'Alphabet',aliases:['alphabet','google','youtube','waymo','gemini'],topics:['Cloud','AI','Media'],peers:['MSFT','META']},
 META:{name:'Meta Platforms',aliases:['meta platforms','facebook','instagram','whatsapp','zuckerberg'],topics:['AI','Media'],peers:['GOOGL','SNAP']},
 NFLX:{name:'Netflix',aliases:['netflix'],topics:['Media','Consumer'],peers:['DIS']},
 AVGO:{name:'Broadcom',aliases:['broadcom'],topics:['Semiconductors','AI'],peers:['NVDA','MRVL']},
 AMD:{name:'AMD',aliases:['advanced micro devices','amd'],topics:['Semiconductors','AI'],peers:['NVDA','INTC']},
 TSM:{name:'TSMC',aliases:['tsmc','taiwan semiconductor'],topics:['Semiconductors','AI'],peers:['NVDA','INTC']},
 ORCL:{name:'Oracle',aliases:['oracle'],topics:['Cloud','AI'],peers:['MSFT']},
 XOM:{name:'Exxon Mobil',aliases:['exxon','exxonmobil'],topics:['Oil','Energy'],peers:['CVX','OXY']},
 CVX:{name:'Chevron',aliases:['chevron'],topics:['Oil','Energy'],peers:['XOM','OXY']},
 OXY:{name:'Occidental Petroleum',aliases:['occidental'],topics:['Oil','Energy'],peers:['XOM','CVX']},
 JPM:{name:'JPMorgan Chase',aliases:['jpmorgan','jp morgan','jamie dimon'],topics:['Banks'],peers:['GS','MS','WFC','BAC']},
 GS:{name:'Goldman Sachs',aliases:['goldman sachs','goldman'],topics:['Banks'],peers:['MS','JPM']},
 MS:{name:'Morgan Stanley',aliases:['morgan stanley'],topics:['Banks'],peers:['GS','JPM']},
 WFC:{name:'Wells Fargo',aliases:['wells fargo'],topics:['Banks'],peers:['JPM','BAC']},
 BAC:{name:'Bank of America',aliases:['bank of america'],topics:['Banks'],peers:['JPM','WFC']},
 LMT:{name:'Lockheed Martin',aliases:['lockheed'],topics:['Defense'],peers:['RTX','NOC']},
 RTX:{name:'RTX',aliases:['raytheon','rtx corp'],topics:['Defense'],peers:['LMT','NOC']},
 NOC:{name:'Northrop Grumman',aliases:['northrop'],topics:['Defense'],peers:['LMT','RTX']},
 LLY:{name:'Eli Lilly',aliases:['eli lilly','lilly','zepbound','mounjaro'],topics:['Healthcare'],peers:['NVO','PFE']},
 NVO:{name:'Novo Nordisk',aliases:['novo nordisk','wegovy','ozempic'],topics:['Healthcare'],peers:['LLY']},
 PFE:{name:'Pfizer',aliases:['pfizer'],topics:['Healthcare'],peers:['MRK','LLY']},
 MRK:{name:'Merck',aliases:['merck'],topics:['Healthcare'],peers:['PFE']},
 COIN:{name:'Coinbase',aliases:['coinbase'],topics:['Crypto'],peers:['MSTR']},
 MSTR:{name:'Strategy',aliases:['microstrategy','michael saylor'],topics:['Crypto'],peers:['COIN']},
 IBIT:{name:'iShares Bitcoin Trust',aliases:['bitcoin etf','ibit'],topics:['Crypto'],peers:['COIN']},
 WMT:{name:'Walmart',aliases:['walmart'],topics:['Retail','Consumer'],peers:['COST','AMZN','TGT']},
 COST:{name:'Costco',aliases:['costco'],topics:['Retail','Consumer'],peers:['WMT']},
 NKE:{name:'Nike',aliases:['nike'],topics:['Consumer','Retail'],peers:[]},
 DAL:{name:'Delta Air Lines',aliases:['delta air lines','delta airlines'],topics:['Consumer','Oil'],peers:['UAL']},
 T:{name:'AT&T',aliases:['at&t'],topics:['Telecom'],peers:['VZ','TMUS']},
 VZ:{name:'Verizon',aliases:['verizon'],topics:['Telecom'],peers:['T','TMUS']},
 TMUS:{name:'T-Mobile',aliases:['t-mobile'],topics:['Telecom'],peers:['T','VZ']},
 GLD:{name:'SPDR Gold Shares',aliases:['gold price','gold prices','bullion'],topics:['Commodities'],peers:[]},
 TLT:{name:'iShares 20+ Year Treasury Bond ETF',aliases:['long-dated treasuries','30-year treasury','long bond'],topics:['Rates'],peers:[]},
};
const TOPIC_PATTERNS:Record<string,RegExp>={
 Markets:/\b(stocks|shares|stock futures|equity futures|wall street|stock markets?|selloff|sell-off|rally|s&p|nasdaq|dow jones|dow|risk appetite|futures|equities)\b/i,
 Credit:/\b(credit spreads?|bonds?|bond yields?|defaults?|debt crisis|liquidity|credit ratings?|high yield|junk bonds?|issuance)\b/i,
 Trade:/\b(tariffs?|trade war|trade deal|supply chain|export ban|export controls|sanctions)\b/i,
 AI:/\b(ai|artificial intelligence|machine learning|data cent(?:er|re)s?|openai|anthropic|chatgpt|llm|gpus?)\b/i,
 Earnings:/\b(earnings|quarterly results|revenue|profit|guidance|outlook|eps|beats? estimates|misses? estimates)\b/i,
 Deals:/\b(merger|acquisition|acquires?|acquired|takeover|buyout|deal to buy|ipo|spin-?off|stake)\b/i,
 Launches:/\b(launch|launches|announces|introduces|unveils|release)\b/i,
 Regulation:/\b(regulators?|regulation|antitrust|ftc|doj|sec probe|lawsuit|fined?|export controls|ban)\b/i,
 Oil:/\b(oil|crude|opec|petroleum|brent|wti|natural gas|lng|energy prices|fuel prices|gasoline|refiner)\b/i,
 Energy:/\b(energy|power grid|utilities|nuclear|solar|electricity)\b/i,
 Geopolitics:/\b(war|conflict|military|missiles?|ceasefire|invasion|airstrikes?|strikes? on|hormuz|houthis|iran|israel|gaza|ukraine|russia|taiwan|nato|troops)\b/i,
 Rates:/\b(federal reserve|fed|powell|interest rates?|rate cut|rate hike|inflation|payrolls|treasury|treasuries|yields?|monetary|cpi|ppi|pce|jobs report|unemployment|central bank|gdp|ecb|boj|bank of england|lagarde)\b/i,
 Semiconductors:/\b(semiconductors?|chips?|chipmakers?|gpus?|foundry|nvidia|intel|marvell|amd|broadcom|micron|tsmc)\b/i,
 Cloud:/\b(cloud|aws|azure|data cent(?:er|re)s?|hyperscalers?)\b/i,
 Automotive:/\b(vehicles?|automotive|automakers?|electric cars?|evs?|robotaxi)\b/i,
 Retail:/\b(retail|retailers?|consumer spending|ecommerce|e-commerce|holiday sales)\b/i,
 Consumer:/\b(consumers?|consumer confidence|sentiment|michigan|spending|airlines?)\b/i,
 Banks:/\b(banks?|banking|lenders?|wall street banks|capital requirements|basel)\b/i,
 Defense:/\b(defen[cs]e|pentagon|weapons|munitions|fighter jets?|arms)\b/i,
 Healthcare:/\b(drugmakers?|pharma|fda|obesity drugs?|glp-1|vaccines?|biotech|medicare)\b/i,
 Crypto:/\b(bitcoin|crypto|cryptocurrenc(?:y|ies)|ether(?:eum)?|stablecoins?|blockchain)\b/i,
 Commodities:/\b(gold|silver|copper|commodit(?:y|ies)|metals)\b/i,
 Media:/\b(streaming|advertising|ad sales|box office|social media)\b/i,
 Telecom:/\b(telecom|wireless|carriers?|spectrum|5g|starlink)\b/i,
};
const NOISE=/\b(nobel|award|prize|obituary|dies at|war crimes trial|genocide trial|recipe|horoscope|celebrity|wedding|best deals|coupon|sweepstakes|quiz)\b/i;
const re=new Map<string,RegExp>();
const word=(s:string,flags='i')=>{const k=s+flags;let r=re.get(k);if(!r){r=new RegExp('(?:^|[^\\w&])'+s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?![\\w])',flags);re.set(k,r);}return r;};
/** Tags any covered issuer (holdings + reference universe) and topics. Short tickers need a $ or uppercase context. */
export function classify(text:string,universe:string[]):{symbols:string[];topics:string[]} {
 if(NOISE.test(text))return {symbols:[],topics:[]};
 const pool=[...new Set([...universe,...Object.keys(COMPANIES)])];
 const symbols=pool.filter(s=>COMPANIES[s]?.aliases.some(a=>word(a).test(text))||(s.length>=3&&word(s,'').test(text))||word('$'+s,'').test(text));
 return {symbols,topics:Object.entries(TOPIC_PATTERNS).filter(([,r])=>r.test(text)).map(([t])=>t)};
}
export function plain(s:string):string{return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#(?:x([a-f0-9]+)|([0-9]+));/gi,(_,hex,dec)=>{const code=parseInt(hex??dec,hex?16:10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):'';}).replace(/\s+/g,' ').trim();}
/** Headline themes used to group the brief like a desk note. Order is display order. */
export const THEMES:{key:string;label:string;topics:string[]}[]=[
 {key:'ai',label:'AI / Technology',topics:['AI','Semiconductors','Cloud']},
 {key:'macro',label:'Rates, Fed & Macro',topics:['Rates','Credit']},
 {key:'geo',label:'Geopolitics & War',topics:['Geopolitics','Defense']},
 {key:'energy',label:'Energy & Commodities',topics:['Oil','Energy','Commodities']},
 {key:'corp',label:'Earnings & Deals',topics:['Earnings','Deals']},
 {key:'policy',label:'Policy, Trade & Regulation',topics:['Trade','Regulation']},
 {key:'sectors',label:'Sectors: Banks, Health, Consumer, Telecom',topics:['Banks','Healthcare','Consumer','Retail','Automotive','Telecom','Media']},
 {key:'crypto',label:'Crypto',topics:['Crypto']},
 {key:'markets',label:'Markets',topics:['Markets','Launches']},
];
export const themeOf=(topics:string[])=>THEMES.find(t=>t.topics.some(x=>topics.includes(x)))??THEMES[THEMES.length-1];
