/**
 * OCR Scanner Module
 * Uses Tesseract.js to read text from screenshots
 * and detect PoE items.
 */

const Tesseract = require('tesseract.js');

class OCRScanner {
  constructor() {
    this.worker = null;
    this.isInitialized = false;
    this.itemKeywords = {
      // Currency
      'chaos orb': { type: 'currency', keywords: ['chaos orb', 'chaos'] },
      'divine orb': { type: 'currency', keywords: ['divine orb', 'divine'] },
      'exalted orb': { type: 'currency', keywords: ['exalted orb', 'exalted'] },
      'orb of alteration': { type: 'currency', keywords: ['orb of alteration'] },
      'orb of fusing': { type: 'currency', keywords: ['orb of fusing', 'fusing'] },
      'orb of alchemy': { type: 'currency', keywords: ['orb of alchemy'] },
      'orb of scouring': { type: 'currency', keywords: ['orb of scouring'] },
      'regal orb': { type: 'currency', keywords: ['regal orb'] },
      'vaal orb': { type: 'currency', keywords: ['vaal orb'] },
      'chromatic orb': { type: 'currency', keywords: ['chromatic orb'] },
      'jeweller orb': { type: 'currency', keywords: ['jeweller'] },
      'cartographer chisel': { type: 'currency', keywords: ['cartographer chisel', 'chisel'] },
      'orb of regret': { type: 'currency', keywords: ['orb of regret'] },
      'blessed orb': { type: 'currency', keywords: ['blessed orb'] },
      'orb of chance': { type: 'currency', keywords: ['orb of chance'] },
      
      // Fragments
      'sacrifice at dusk': { type: 'fragment', keywords: ['sacrifice at dusk'] },
      'sacrifice at midnight': { type: 'fragment', keywords: ['sacrifice at midnight'] },
      'sacrifice at dawn': { type: 'fragment', keywords: ['sacrifice at dawn'] },
      'sacrifice at noon': { type: 'fragment', keywords: ['sacrifice at noon'] },
      'mortal grief': { type: 'fragment', keywords: ['mortal grief'] },
      'mortal rage': { type: 'fragment', keywords: ['mortal rage'] },
      'mortal hope': { type: 'fragment', keywords: ['mortal hope'] },
      'mortal ignorance': { type: 'fragment', keywords: ['mortal ignorance'] },
      
      // Scarabs (generic definitions)
      'scarab': { type: 'scarab', keywords: ['scarab'] },
      
      // Maps
      'map': { type: 'map', keywords: ['map'] },
      
      // Divination Cards
      'card': { type: 'divination_card', keywords: ['divination card'] }
    };
  }

  /**
   * Start the Tesseract worker
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.worker = await Tesseract.createWorker('eng');
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to start Tesseract:', error);
      throw error;
    }
  }

  /**
   * Stop the Tesseract worker
   */
  async terminate() {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
    }
  }

  /**
   * Scan the image and detect items
   * @param {Buffer} imageBuffer - PNG/JPG buffer
   * @returns {Array} - Detected items
   */
  async scanImage(imageBuffer) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Read the text through Tesseract.
      const { data: { text } } = await this.worker.recognize(imageBuffer);

      // Parse items from the OCR text.
      const items = this.parseItemsFromText(text);

      return items;
    } catch (error) {
      console.error('OCR scan failed:', error);
      return [];
    }
  }

  /**
   * Parse PoE items from OCR text
   */
  parseItemsFromText(text) {
    const items = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      // Look for quantity + item name patterns.
      // Example: "x45 Chaos Orb" or "45x Chaos Orb" or "Chaos Orb x45"
      
      const patterns = [
        // x45 Chaos Orb or 45x Chaos Orb
        /^(?:x?(\d+)x?)\s*(.+?)$/i,
        // Chaos Orb x45 or Chaos Orb (45)
        /^(.+?)\s*(?:x?(\d+)x?|\((\d+)\))$/i
      ];

      let quantity = 1;
      let itemName = line;

      // Check whether the line includes a stack size.
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const num1 = parseInt(match[1]);
          const num2 = parseInt(match[2]);
          const num3 = parseInt(match[3]);
          
          if (num1 && num1 > 1 && num1 < 10000) {
            quantity = num1;
            itemName = match[2].trim();
            break;
          } else if (num2 && num2 > 1 && num2 < 10000) {
            quantity = num2;
            itemName = match[1].trim();
            break;
          } else if (num3 && num3 > 1 && num3 < 10000) {
            quantity = num3;
            itemName = match[1].trim();
            break;
          }
        }
      }

      // Detect the item type.
      const itemType = this.detectItemType(itemName);
      
      // Check whether the OCR match looks valid.
      if (itemType && this.isValidItem(itemName)) {
        items.push({
          itemName: this.cleanItemName(itemName),
          itemType,
          quantity,
          source: 'ocr'
        });
      }
    }

    // Merge duplicate items.
    return this.mergeDuplicateItems(items);
  }

  /**
   * Detect the item type
   */
  detectItemType(itemName) {
    const lowerName = itemName.toLowerCase();

    for (const [standardName, data] of Object.entries(this.itemKeywords)) {
      for (const keyword of data.keywords) {
        if (lowerName.includes(keyword.toLowerCase())) {
          return data.type;
        }
      }
    }

    // Default to currency when the text looks close enough.
    if (this.looksLikeCurrency(lowerName)) {
      return 'currency';
    }

    return 'other';
  }

  /**
   * Check whether the text looks like currency
   */
  looksLikeCurrency(text) {
    const currencyPatterns = [
      /orb/i,
      /shard/i,
      /fragment/i,
      /sacrifice/i,
      /mortal/i,
      /splinter/i,
      /breachstone/i
    ];

    return currencyPatterns.some(pattern => pattern.test(text));
  }

  /**
   * Validate the detected item
   */
  isValidItem(itemName) {
    // Require at least 3 characters.
    if (itemName.length < 3) return false;

    // Reject plain numbers.
    if (/^\d+$/.test(itemName)) return false;

    // Filter common OCR false positives.
    const invalidPatterns = [
      /^stash$/i,
      /^inventory$/i,
      /^character$/i,
      /^level$/i,
      /^life$/i,
      /^mana$/i,
      /^exit$/i,
      /^menu$/i,
      /^options$/i
    ];

    return !invalidPatterns.some(pattern => pattern.test(itemName));
  }

  /**
   * Clean the item name
   */
  cleanItemName(name) {
    return name
      .replace(/[^\w\s-']/gi, '') // Remove special characters.
      .replace(/\s+/g, ' ') // Collapse repeated spaces.
      .trim();
  }

  /**
   * Merge identical items
   */
  mergeDuplicateItems(items) {
    const merged = {};

    for (const item of items) {
      const key = `${item.itemName.toLowerCase()}_${item.itemType}`;
      
      if (merged[key]) {
        merged[key].quantity += item.quantity;
      } else {
        merged[key] = { ...item };
      }
    }

    return Object.values(merged);
  }

  /**
   * Scan a specific region (coordinate based)
   * Note: Electron's desktopCapturer can already capture a specific region.
   */
  async scanRegion(imageBuffer, region) {
    // Placeholder for future implementation.
    // The current flow scans the whole image; cropping can be added later if needed.
    return this.scanImage(imageBuffer);
  }
}

module.exports = OCRScanner;
