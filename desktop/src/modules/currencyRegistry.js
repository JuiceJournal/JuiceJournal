/**
 * Currency Registry Module
 * Single source of truth for PoE currency/item type definitions.
 *
 * Two layers:
 * 1. Static fallback data — always available, covers core + legacy currencies
 * 2. Dynamic data — populated at runtime from poe.ninja API responses
 *
 * When priceService.syncPrices() runs, it feeds discovered items back here
 * so the registry always reflects what actually exists in the current league.
 *
 * Usage:
 *   const registry = require('./currencyRegistry');
 *   registry.setPoeVersion('poe1');
 *   registry.getCategory('Chaos Orb');       // → 'currency'
 *   registry.getIcon('Chaos Orb');            // → 'https://...' (poe.ninja CDN)
 *   registry.getNinjaTypes();                 // → ['Currency','Fragment','Scarab',...]
 *   registry.getAllKnownItems('currency');     // → [{ name, icon, tradeId, chaosValue }]
 */

// ─── Static poe.ninja API type lists (fallback) ──────────────────

const POE1_CURRENCY_TYPES = ['Currency', 'Fragment'];
const POE1_ITEM_TYPES = [
  'Oil', 'Scarab', 'Fossil', 'Resonator', 'Essence',
  'DivinationCard', 'SkillGem', 'UniqueMap', 'Map',
  'UniqueJewel', 'UniqueFlask', 'UniqueWeapon', 'UniqueArmour',
  'UniqueAccessory', 'Beast', 'DeliriumOrb', 'Omen',
  'ClusterJewel', 'Invitation', 'Memory', 'Coffin', 'AllflameEmber',
  'Incubator', 'Catalyst', 'Vial', 'BlightedMap', 'BlightRavagedMap',
  'UniqueRelic', 'Tattoo', 'Rune'
];

const POE2_CURRENCY_TYPES = [
  'Currency', 'Fragments', 'UncutGems', 'SoulCores',
  'Idol', 'Runes', 'Essences', 'Expedition', 'Ultimatum'
];
const POE2_ITEM_TYPES = [];

// Quick sync = most important types for profit tracking
const POE1_QUICK_SYNC = [
  'Currency', 'Fragment', 'DivinationCard', 'Scarab',
  'Essence', 'Oil', 'Fossil', 'UniqueMap'
];
const POE2_QUICK_SYNC = [
  'Currency', 'Fragments', 'Essences', 'Runes',
  'UncutGems', 'SoulCores', 'Idol'
];

// ─── Static core currencies (always present, per version) ─────────

const CORE_CURRENCIES = {
  poe1: [
    { name: 'Chaos Orb', category: 'currency', tradeId: 'chaos' },
    { name: 'Divine Orb', category: 'currency', tradeId: 'divine' },
    { name: 'Exalted Orb', category: 'currency', tradeId: 'exalted' },
    { name: 'Mirror of Kalandra', category: 'currency', tradeId: 'mirror' },
    { name: 'Vaal Orb', category: 'currency', tradeId: 'vaal' },
    { name: 'Orb of Alchemy', category: 'currency', tradeId: 'alch' },
    { name: 'Orb of Fusing', category: 'currency', tradeId: 'fusing' },
    { name: 'Chromatic Orb', category: 'currency', tradeId: 'chromatic' },
    { name: 'Orb of Alteration', category: 'currency', tradeId: 'alt' },
    { name: "Jeweller's Orb", category: 'currency', tradeId: 'jewellers' },
    { name: 'Orb of Scouring', category: 'currency', tradeId: 'scour' },
    { name: 'Blessed Orb', category: 'currency', tradeId: 'blessed' },
    { name: 'Regal Orb', category: 'currency', tradeId: 'regal' },
    { name: 'Orb of Regret', category: 'currency', tradeId: 'regret' },
    { name: "Gemcutter's Prism", category: 'currency', tradeId: 'gcp' },
    { name: 'Orb of Chance', category: 'currency', tradeId: 'chance' },
    { name: "Cartographer's Chisel", category: 'currency', tradeId: 'chisel' },
    { name: 'Orb of Transmutation', category: 'currency', tradeId: 'transmute' },
    { name: 'Orb of Augmentation', category: 'currency', tradeId: 'aug' },
    { name: 'Portal Scroll', category: 'currency', tradeId: 'portal' },
    { name: 'Scroll of Wisdom', category: 'currency', tradeId: 'wisdom' },
    { name: "Armourer's Scrap", category: 'currency', tradeId: 'scrap' },
    { name: "Blacksmith's Whetstone", category: 'currency', tradeId: 'whetstone' },
    { name: "Glassblower's Bauble", category: 'currency', tradeId: 'bauble' },
    { name: 'Annulment Orb', category: 'currency', tradeId: 'annul' },
    { name: 'Ancient Orb', category: 'currency', tradeId: 'ancient-orb' },
    { name: 'Harbinger Orb', category: 'currency', tradeId: 'harbinger-orb' },
    { name: 'Engineer Orb', category: 'currency', tradeId: 'engineers-orb' },
    { name: 'Awakened Sextant', category: 'currency', tradeId: 'awakened-sextant' },
    { name: 'Elevated Sextant', category: 'currency', tradeId: 'elevated-sextant' },
    { name: 'Stacked Deck', category: 'currency', tradeId: 'stacked-deck' },
  ],
  poe2: [
    { name: 'Exalted Orb', category: 'currency', tradeId: 'exalted' },
    { name: 'Divine Orb', category: 'currency', tradeId: 'divine' },
    { name: 'Chaos Orb', category: 'currency', tradeId: 'chaos' },
    { name: 'Vaal Orb', category: 'currency', tradeId: 'vaal' },
    { name: 'Regal Orb', category: 'currency', tradeId: 'regal' },
    { name: 'Orb of Alchemy', category: 'currency', tradeId: 'alch' },
    { name: 'Orb of Chance', category: 'currency', tradeId: 'chance' },
    { name: 'Orb of Augmentation', category: 'currency', tradeId: 'aug' },
    { name: 'Orb of Transmutation', category: 'currency', tradeId: 'transmute' },
    { name: 'Orb of Annulment', category: 'currency', tradeId: 'annul' },
    { name: "Arcanist's Etcher", category: 'currency', tradeId: 'arcanists-etcher' },
    { name: "Artificer's Orb", category: 'currency', tradeId: 'artificers-orb' },
    { name: 'Mirror of Kalandra', category: 'currency', tradeId: 'mirror' },
    { name: 'Greater Jeweller Orb', category: 'currency', tradeId: 'greater-jewellers-orb' },
    { name: 'Perfect Jeweller Orb', category: 'currency', tradeId: 'perfect-jewellers-orb' },
  ]
};

// PoE API frameType → category mapping (stable across versions)
const FRAME_TYPE_MAP = {
  0: 'normal',    // normal item
  1: 'magic',
  2: 'rare',
  3: 'unique',
  4: 'gem',
  5: 'currency',
  6: 'divination_card',
  7: 'quest',
  8: 'prophecy',
  9: 'foil',
  10: 'sentinel'
};

// Keyword → category patterns for text-based detection (OCR, log parsing)
const CATEGORY_KEYWORDS = [
  { pattern: /\borb\b/i, category: 'currency' },
  { pattern: /\bshard\b/i, category: 'currency' },
  { pattern: /\bscroll\b/i, category: 'currency' },
  { pattern: /\bchisel\b/i, category: 'currency' },
  { pattern: /\bwhetstone\b/i, category: 'currency' },
  { pattern: /\bbauble\b/i, category: 'currency' },
  { pattern: /\bprism\b/i, category: 'currency' },
  { pattern: /\bfragment\b/i, category: 'fragment' },
  { pattern: /\bsacrifice at\b/i, category: 'fragment' },
  { pattern: /\bmortal\b/i, category: 'fragment' },
  { pattern: /\bsplinter\b/i, category: 'fragment' },
  { pattern: /\bbreachstone\b/i, category: 'fragment' },
  { pattern: /\bemblem\b/i, category: 'fragment' },
  { pattern: /\bscarab\b/i, category: 'scarab' },
  { pattern: /\bessence\b/i, category: 'essence' },
  { pattern: /\bfossil\b/i, category: 'fossil' },
  { pattern: /\bresonator\b/i, category: 'fossil' },
  { pattern: /\boil\b/i, category: 'oil' },
  { pattern: /\bcatalyst\b/i, category: 'catalyst' },
  { pattern: /\bdelirium orb\b/i, category: 'delirium_orb' },
  { pattern: /\bincubator\b/i, category: 'incubator' },
  { pattern: /\bdivination card\b/i, category: 'divination_card' },
  { pattern: /\bmap\b/i, category: 'map' },
  { pattern: /\btattoo\b/i, category: 'tattoo' },
  { pattern: /\brune\b/i, category: 'rune' },
  { pattern: /\bomen\b/i, category: 'omen' },
  { pattern: /\bcoffin\b/i, category: 'coffin' },
  { pattern: /\ballflame\b/i, category: 'allflame' },
];

// ─── Registry Class ───────────────────────────────────────────────

class CurrencyRegistry {
  constructor() {
    this.poeVersion = 'poe1';

    // Dynamic item database: key = lowercase name → { name, category, icon, tradeId, chaosValue, source }
    this.items = new Map();

    // Track which ninja types actually returned data for current league
    this.activeNinjaTypes = new Set();

    // League-specific custom types discovered at runtime
    this.discoveredTypes = new Set();

    // Initialize with static core currencies
    this._loadCoreCurrencies();
  }

  // ─── Configuration ────────────────────────────────────────────

  setPoeVersion(version) {
    const changed = this.poeVersion !== version;
    this.poeVersion = version === 'poe2' ? 'poe2' : 'poe1';
    if (changed) {
      this.items.clear();
      this.activeNinjaTypes.clear();
      this.discoveredTypes.clear();
      this._loadCoreCurrencies();
    }
  }

  getPoeVersion() {
    return this.poeVersion;
  }

  // ─── Ninja type lists ─────────────────────────────────────────

  /**
   * Get poe.ninja currency overview types for current version
   */
  getCurrencyTypes() {
    return this.poeVersion === 'poe2' ? POE2_CURRENCY_TYPES : POE1_CURRENCY_TYPES;
  }

  /**
   * Get poe.ninja item overview types for current version
   */
  getItemTypes() {
    return this.poeVersion === 'poe2' ? POE2_ITEM_TYPES : POE1_ITEM_TYPES;
  }

  /**
   * Get quick-sync types (most important for profit tracking)
   */
  getQuickSyncTypes() {
    return this.poeVersion === 'poe2' ? POE2_QUICK_SYNC : POE1_QUICK_SYNC;
  }

  /**
   * Get all types that actually returned data from poe.ninja
   * Falls back to static list if no sync has happened yet
   */
  getActiveTypes() {
    if (this.activeNinjaTypes.size > 0) {
      return [...this.activeNinjaTypes];
    }
    return [...this.getCurrencyTypes(), ...this.getQuickSyncTypes()];
  }

  // ─── Dynamic registration ─────────────────────────────────────

  /**
   * Register items discovered from poe.ninja sync
   * Called by PriceService after each type is fetched
   */
  registerFromNinja(ninjaType, items) {
    this.activeNinjaTypes.add(ninjaType);

    for (const item of items) {
      const key = (item.name || '').toLowerCase().trim();
      if (!key) continue;

      const existing = this.items.get(key);
      this.items.set(key, {
        name: item.name,
        category: item.category || existing?.category || this._detectCategory(item.name),
        icon: item.icon || existing?.icon || null,
        tradeId: item.tradeId || existing?.tradeId || null,
        chaosValue: item.chaosValue ?? existing?.chaosValue ?? 0,
        ninjaType,
        source: 'poe.ninja'
      });
    }
  }

  /**
   * Register a single item (from PoE API stash response, manual add, etc.)
   */
  registerItem(name, data = {}) {
    const key = name.toLowerCase().trim();
    const existing = this.items.get(key);
    this.items.set(key, {
      name: data.name || existing?.name || name,
      category: data.category || existing?.category || this._detectCategory(name),
      icon: data.icon || existing?.icon || null,
      tradeId: data.tradeId || existing?.tradeId || null,
      chaosValue: data.chaosValue ?? existing?.chaosValue ?? 0,
      source: data.source || existing?.source || 'manual'
    });
  }

  // ─── Lookups ──────────────────────────────────────────────────

  /**
   * Get category for an item name
   */
  getCategory(itemName) {
    const entry = this.items.get((itemName || '').toLowerCase().trim());
    if (entry) return entry.category;
    return this._detectCategory(itemName);
  }

  /**
   * Get icon URL for an item (from poe.ninja CDN)
   */
  getIcon(itemName) {
    const entry = this.items.get((itemName || '').toLowerCase().trim());
    return entry?.icon || null;
  }

  /**
   * Get full item info
   */
  getItem(itemName) {
    return this.items.get((itemName || '').toLowerCase().trim()) || null;
  }

  /**
   * Check if an item is known
   */
  isKnown(itemName) {
    return this.items.has((itemName || '').toLowerCase().trim());
  }

  /**
   * Get all known items, optionally filtered by category
   */
  getAllItems(category = null) {
    const result = [];
    for (const item of this.items.values()) {
      if (!category || item.category === category) {
        result.push(item);
      }
    }
    return result;
  }

  /**
   * Get all unique categories currently in the registry
   */
  getCategories() {
    const cats = new Set();
    for (const item of this.items.values()) {
      cats.add(item.category);
    }
    return [...cats].sort();
  }

  /**
   * Get item count per category (for UI filter badges)
   */
  getCategoryCounts() {
    const counts = {};
    for (const item of this.items.values()) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }

  /**
   * Get item count
   */
  size() {
    return this.items.size;
  }

  /**
   * Get frameType → category mapping
   */
  getCategoryForFrameType(frameType) {
    return FRAME_TYPE_MAP[frameType] || 'other';
  }

  /**
   * Get category keyword patterns (for OCR / text matching)
   */
  getCategoryKeywords() {
    return CATEGORY_KEYWORDS;
  }

  // ─── Serialization ────────────────────────────────────────────

  /**
   * Export registry state for persistence
   */
  export() {
    const items = {};
    for (const [key, val] of this.items) {
      items[key] = val;
    }
    return {
      poeVersion: this.poeVersion,
      activeNinjaTypes: [...this.activeNinjaTypes],
      itemCount: this.items.size,
      items
    };
  }

  /**
   * Import registry state from persistence
   */
  import(data) {
    if (!data) return;
    if (data.poeVersion) this.poeVersion = data.poeVersion;
    if (data.activeNinjaTypes) {
      this.activeNinjaTypes = new Set(data.activeNinjaTypes);
    }
    if (data.items) {
      for (const [key, val] of Object.entries(data.items)) {
        this.items.set(key, val);
      }
    }
  }

  /**
   * Clear all dynamic data, re-load static cores
   */
  reset() {
    this.items.clear();
    this.activeNinjaTypes.clear();
    this.discoveredTypes.clear();
    this._loadCoreCurrencies();
  }

  // ─── Internal ─────────────────────────────────────────────────

  _loadCoreCurrencies() {
    const cores = CORE_CURRENCIES[this.poeVersion] || CORE_CURRENCIES.poe1;
    for (const c of cores) {
      this.items.set(c.name.toLowerCase(), {
        name: c.name,
        category: c.category,
        icon: null,
        tradeId: c.tradeId,
        chaosValue: 0,
        source: 'static'
      });
    }
  }

  /**
   * Detect category from item name using keyword patterns
   */
  _detectCategory(name) {
    if (!name) return 'other';
    for (const { pattern, category } of CATEGORY_KEYWORDS) {
      if (pattern.test(name)) return category;
    }
    return 'other';
  }
}

// Export as singleton for shared access across modules
module.exports = new CurrencyRegistry();
