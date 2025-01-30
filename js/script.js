//#region Classes

class SearchMatch {
    constructor() {
        this.itemKey = null;
        this.done = false;
        this.attention = false;
        this.notes = false;
        this.tags = false;
        this.inProgress = false;
        this.explicitTags = false;
        this.generic = false;
    }

    get isAMatch() {
        return this.done && this.attention && this.notes && this.tags && this.inProgress && this.explicitTags && this.generic;
    }
}

class MCItem {
    constructor(name, type, image, variants = [], tags = []) {
        this.name = name;
        this.type = type;
        this.image = image;
        this.variants = variants;
        this.tags = tags;
    }

    getKey() {
        return getItemKey(this.name, this.type);
    }

    createHtmlElement() {
        const element = document.createElement('div');
        const itemKey = this.getKey();
        element.className = 'block-item' +
            (completedBlocks.has(itemKey) ? ' done' : '') +
            (needsAttentionItems.has(itemKey) ? ' needs-attention' : '') +
            (inProgressItems.has(itemKey) ? ' in-progress' : '');

        // add the key as a data attribute for easy access
        element.dataset.key = itemKey;

        if (this.tags.length > 0) {
            element.dataset.tags = this.tags.join(',');
        }

        element.innerHTML = `
            <button class="info-button" title="Open item details and notes">ℹ</button>
            <div class="item-content"></div>
        `;

        const itemContent = element.querySelector('.item-content');
        const infoButton = element.querySelector('.info-button');

        infoButton.onclick = (e) => {
            e.stopPropagation();
            createNoteModal(this.name, this.type);
        };

        this.setupImage(itemContent);
        this.setupName(element);
        this.setupClickHandlers(element);

        return element;
    }

    setupImage(container) {
        const hasVariants = this.variants && this.variants.length > 0;
        const imageExt = this.image.split('.').pop();

        if (hasVariants) {
            container.dataset.variants = JSON.stringify(this.variants);
            container.dataset.currentVariant = '0';
            container.dataset.baseName = this.image.split('.')[0];
            container.dataset.ext = imageExt;

            this.variants.forEach((variant, idx) => {
                const img = new Image();
                const name = this.name.replace(/ /g, '_');
                const variantName = variant.replace(/ /g, '_');
                img.src = `images/${this.type}/${name}_${variantName}.${imageExt}`;
                img.alt = this.name;
                img.style.display = idx === 0 ? 'block' : 'none';
                img.className = 'variant-image';
                container.appendChild(img);
            });

            setInterval(() => {
                const currentVariant = parseInt(container.dataset.currentVariant);
                const nextVariant = (currentVariant + 1) % this.variants.length;
                container.dataset.currentVariant = nextVariant;
                container.querySelector('.variant-image:nth-child(' + (currentVariant + 1) + ')').style.display = 'none';
                container.querySelector('.variant-image:nth-child(' + (nextVariant + 1) + ')').style.display = 'block';
            }, 1000);
        } else {
            container.innerHTML = `
                <img src="images/${this.type}/${this.image}" alt="${this.name}" onerror="this.src='images/missing.webp'">
            `;
        }
    }

    setupName(element) {
        const blockName = document.createElement('div');
        blockName.className = 'block-name';
        blockName.textContent = this.name;
        element.appendChild(blockName);
    }

    setupClickHandlers(element) {
        element.addEventListener('click', (e) => {
            const itemKey = this.getKey();

            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                element.classList.toggle('needs-attention');
                if (element.classList.contains('needs-attention')) {
                    needsAttentionItems.add(itemKey);
                } else {
                    needsAttentionItems.delete(itemKey);
                }
                localStorage.setItem('needsAttentionItems', JSON.stringify([...needsAttentionItems]));
                return;
            }

            element.classList.toggle('done');
            if (element.classList.contains('done')) {
                completedBlocks.add(itemKey);
            } else {
                completedBlocks.delete(itemKey);
            }
            updateCounter(document.querySelectorAll('.block-item').length);
            updateSectionCounter(this.type);
            localStorage.setItem('completedBlocks', JSON.stringify([...completedBlocks]));
        });
    }

    matchesSearch(searchTerms) {
        const itemKey = this.getKey();
        const match = new SearchMatch();
        match.itemKey = itemKey;

        // Get searchable properties
        const name = this.name.toLowerCase();
        const tags = this.tags.map(t => t.toLowerCase());
        const hasNotes = itemNotes[itemKey]?.length > 0;
        const hasTags = this.tags.length > 0;
        const isDone = completedBlocks.has(itemKey);
        const needsAttention = needsAttentionItems.has(itemKey);
        const isInProgress = inProgressItems.has(itemKey);

        // Check states if they were specified in search
        match.done = searchTerms.done === null || isDone === searchTerms.done;
        match.attention = searchTerms.attention === null || needsAttention === searchTerms.attention;
        match.notes = searchTerms.hasNotes === null || hasNotes === searchTerms.hasNotes;
        match.tags = searchTerms.hasTags === null || hasTags === searchTerms.hasTags;
        match.inProgress = searchTerms.inProgress === null || isInProgress === searchTerms.inProgress;

        // Check explicit tag searches
        match.explicitTags = searchTerms.explicitTags.length === 0 || searchTerms.explicitTags.every(({tag, negated}) => {
            const hasTag = tags.some(t => t.includes(tag));
            return negated ? !hasTag : hasTag;
        });

        // Check generic terms against both name and tags
        match.generic = searchTerms.generic.length === 0 || searchTerms.generic.every(({term, negated}) => {
            const matchesName = negated ? !name.includes(term) : name.includes(term);
            if (matchesName) return true;
            const matchesTag = negated ? !tags.some(t => t.includes(term)) : tags.some(t => t.includes(term));
            return matchesTag;
        });

        return match.isAMatch;
    }
}
//#endregion

//#region Initialization and State Management
let VALID_SECTIONS = [];
const NOTE_TYPES = ['Bug', 'Note', 'Todo', 'Question'];

// Helper function to create composite keys
function getItemKey(name, type) {
    return `${type}:${name}`;
}

// Update state initialization to use composite keys
let completedBlocks = new Set(JSON.parse(localStorage.getItem('completedBlocks') || '[]'));
const collapsedSections = new Set(JSON.parse(localStorage.getItem('collapsedSections') || '[]'));
const needsAttentionItems = new Set(JSON.parse(localStorage.getItem('needsAttentionItems') || '[]'));
const itemNotes = JSON.parse(localStorage.getItem('itemNotes') || '{}');
const inProgressItems = new Set(JSON.parse(localStorage.getItem('inProgressItems') || '[]'));

// Add a registry to store MCItem instances
const itemRegistry = new Map();
//#endregion

//#region Theme Management
const themeToggle = document.getElementById('themeToggle');
const html = document.documentElement;
const savedTheme = localStorage.getItem('theme') || 'light';
html.dataset.theme = savedTheme;

themeToggle.addEventListener('click', () => {
    const newTheme = html.dataset.theme === 'light' ? 'dark' : 'light';
    html.dataset.theme = newTheme;
    localStorage.setItem('theme', newTheme);
});
//#endregion

//#region Header Height Management
const header = document.querySelector('.header');
document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');

window.addEventListener('resize', () => {
    document.documentElement.style.setProperty('--header-height', header.offsetHeight + 'px');
});
//#endregion

//#region Import/Export Functionality
const exportBtn = document.getElementById('exportBtn');
const importBtn = document.getElementById('importBtn');
const importFile = document.getElementById('importFile');

// Update the export click handler
exportBtn.addEventListener('click', () => {
    const exportData = {};
    VALID_SECTIONS.forEach(type => exportData[type] = {});

    VALID_SECTIONS.forEach(type => {
        const section = document.querySelector(`section[data-type="${type}"]`);
        if (!section) return;

        section.querySelectorAll('.block-item').forEach(block => {
            const name = block.querySelector('.block-name').textContent;
            const itemKey = getItemKey(name, type);
            exportData[type][name] = {
                done: completedBlocks.has(itemKey),
                needsAttention: needsAttentionItems.has(itemKey),
                inProgress: inProgressItems.has(itemKey),
                notes: itemNotes[itemKey] || []
            };
        });
    });

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resource-pack-progress.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

importBtn.addEventListener('click', () => {
    importFile.click();
});

// Update the import handler
importFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);

            // Clear existing sets
            completedBlocks.clear();
            needsAttentionItems.clear();
            inProgressItems.clear();
            Object.keys(itemNotes).forEach(key => delete itemNotes[key]);

            // Handle both old and new format
            if (data && typeof data === 'object') {
                if (VALID_SECTIONS.some(section => data[section])) {
                    // New category-based format
                    VALID_SECTIONS.forEach(category => {
                        if (data[category] && typeof data[category] === 'object') {
                            Object.entries(data[category]).forEach(([name, states]) => {
                                const itemKey = getItemKey(name, category);
                                if (states.done) completedBlocks.add(itemKey);
                                if (states.needsAttention) needsAttentionItems.add(itemKey);
                                if (states.inProgress) inProgressItems.add(itemKey);
                                if (states.notes && states.notes.length) {
                                    itemNotes[itemKey] = states.notes;
                                }
                            });
                        }
                    });
                } else {
                    // Old flat format
                    Object.entries(data).forEach(([name, states]) => {
                        if (states.done) completedBlocks.add(name);
                        if (states.needsAttention) needsAttentionItems.add(name);
                        if (states.inProgress) inProgressItems.add(name);
                        if (states.notes && states.notes.length) {
                            itemNotes[name] = states.notes;
                        }
                    });
                }

                // Save to localStorage
                localStorage.setItem('completedBlocks', JSON.stringify([...completedBlocks]));
                localStorage.setItem('needsAttentionItems', JSON.stringify([...needsAttentionItems]));
                localStorage.setItem('inProgressItems', JSON.stringify([...inProgressItems]));
                localStorage.setItem('itemNotes', JSON.stringify(itemNotes));

                // Update UI
                document.querySelectorAll('.block-item').forEach(block => {
                    const name = block.querySelector('.block-name').textContent;
                    const section = block.closest('.content-section');
                    const type = section.dataset.type;
                    const itemKey = getItemKey(name, type);

                    const states = data[type]?.[name] || data[name] || {};
                    block.classList.toggle('done', completedBlocks.has(itemKey));
                    block.classList.toggle('needs-attention', needsAttentionItems.has(itemKey));
                    block.classList.toggle('in-progress', inProgressItems.has(itemKey));
                });

                VALID_SECTIONS.forEach(type => {
                    updateSectionCounter(type);
                });

                updateCounter(document.querySelectorAll('.block-item').length);
                alert('Import successful!');
            } else {
                throw new Error('Invalid format');
            }
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing file: Invalid format');
        }
    };
    reader.readAsText(file);
    importFile.value = ''; // Reset file input
});
//#endregion

//#region Counter Management
const completedCountEl = document.getElementById('completedCount');
const totalCountEl = document.getElementById('totalCount');

function updateCounter(totalBlocks) {
    const completed = completedBlocks.size;
    const percentage = ((completed / totalBlocks) * 100).toFixed(1);
    
    completedCountEl.textContent = completed;
    totalCountEl.textContent = totalBlocks;
    
    // Update the progress div's title with the percentage
    const progressDiv = document.querySelector('.progress');
    progressDiv.title = `${percentage}% Complete`;
}

function updateSectionCounter(type, isSearching = false) {
    const section = document.querySelector(`section[data-type="${type}"]`);
    if (!section) return;

    const header = section.querySelector('h2');
    const items = section.querySelectorAll('.block-item');
    const visibleItems = section.querySelectorAll('.block-item:not(.hidden)');
    const completedItems = section.querySelectorAll('.block-item.done').length;

    let sectionName = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    if (isSearching) {
        header.textContent = `${sectionName} (${completedItems}/${items.length}) (found ${visibleItems.length})`;
    } else {
        header.textContent = `${sectionName} (${completedItems}/${items.length})`;
    }
}
//#endregion

//#region Search Functionality
const searchInput = document.getElementById('searchInput');
const searchClear = document.getElementById('searchClear');

function filterItems(searchTerm) {
    const subQueries = searchTerm.split(',').map(q => q.trim()).filter(q => q);
    const searchResults = new Set();

    // If no queries, show all items
    if (subQueries.length === 0) {
        document.querySelectorAll('.block-item').forEach(element => {
            element.classList.remove('hidden');
        });
        return;
    }

    // Process each sub-query
    subQueries.forEach(query => {
        const normalizedSearch = query.toLowerCase();
        const words = normalizedSearch.split(/\s+/).filter(word => word);

        // Parse search terms for this sub-query
        const searchTerms = words.reduce((acc, word) => {
            const isNegated = word.startsWith('!');
            const term = isNegated ? word.slice(1) : word;

            if (term === '@done') acc.done = !isNegated;
            else if (term === '@attention') acc.attention = !isNegated;
            else if (term === '@notes') acc.hasNotes = !isNegated;
            else if (term === '@inprogress') acc.inProgress = !isNegated;
            else if (term === '@tags') acc.hasTags = !isNegated;
            else if (term.startsWith('#')) {
                acc.explicitTags.push({
                    tag: term.slice(1).toLowerCase(),
                    negated: isNegated
                });
            }
            else acc.generic.push({
                term: term.toLowerCase(),
                negated: isNegated
            });

            return acc;
        }, {
            done: null,
            attention: null,
            hasNotes: null,
            hasTags: null,
            inProgress: null,
            explicitTags: [],
            generic: []
        });

        // Check items against this sub-query
        document.querySelectorAll('.block-item').forEach(element => {
            const itemKey = element.dataset.key;
            const mcItem = itemRegistry.get(itemKey);

            if (mcItem && mcItem.matchesSearch(searchTerms)) {
                searchResults.add(itemKey);
            }
        });
    });

    // Update visibility based on combined results
    document.querySelectorAll('.block-item').forEach(element => {
        const itemKey = element.dataset.key;
        element.classList.toggle('hidden', !searchResults.has(itemKey));
    });

    // Uncollapse sections when searching
    if (searchTerm) {
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('collapsed');
            const type = section.dataset.type;
            collapsedSections.delete(type);
        });
        localStorage.setItem('collapsedSections', JSON.stringify([...collapsedSections]));
    }

    // Update section counters with search results
    VALID_SECTIONS.forEach(type => {
        updateSectionCounter(type, searchTerm !== '');
        updateSectionNavAvailability(type);
    });
}

searchInput.addEventListener('input', (e) => {

    // if the input is empty, clear the search
    if (e.target.value.length === 0) {
        clearSearch();
        return;
    }

    const hasValue = e.target.value.length > 0;
    searchClear.classList.toggle('visible', hasValue);
    filterItems(e.target.value);
});

searchClear.addEventListener('click', () => {
    clearSearch();

    // focus the search input after clearing
    searchInput.focus();
});

function clearSearch() {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    filterItems('');

    // Reset counters to normal state
    VALID_SECTIONS.forEach(type => updateSectionCounter(type, false));
}

// Advanced menu toggle - updated version
const advancedToggle = document.getElementById('advancedToggle');
const advancedMenu = document.getElementById('advancedMenu');

advancedToggle.addEventListener('click', (e) => {
    advancedMenu.classList.toggle('visible');
    advancedToggle.textContent = advancedMenu.classList.contains('visible') ? '▲' : '▼';
});

// Filter buttons
document.querySelectorAll('.filter-button').forEach(button => {
    button.addEventListener('click', () => {
        const searchInput = document.getElementById('searchInput');
        const filter = button.dataset.filter;
        
        // If shift is held, append the filter instead of replacing
        if (event.shiftKey) {
            const currentValue = searchInput.value.trim();
            searchInput.value = currentValue ? `${currentValue} ${filter}` : filter;
        } else {
            searchInput.value = filter;
        }
        
        // Trigger the search
        searchInput.dispatchEvent(new Event('input'));
    });
});

//#endregion

//#region Navigation
function createSectionNavigation(sectionType) {
    const nav = document.getElementById(`${sectionType}AlphaNav`);
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

    letters.forEach(letter => {
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = letter;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            scrollToLetterInSection(letter, sectionType);
        });
        nav.appendChild(link);
    });

    updateSectionNavAvailability(sectionType);
}

function updateSectionNavAvailability(sectionType) {
    const visibleItems = Array.from(document.querySelectorAll(`#${sectionType}Grid .block-item:not(.hidden)`));

    const availableLetters = new Set(
        visibleItems.map(item =>
            item.querySelector('.block-name').textContent.trim()[0].toUpperCase()
        )
    );

    document.querySelectorAll(`#${sectionType}AlphaNav a`).forEach(link => {
        const letter = link.textContent;
        link.classList.toggle('disabled', !availableLetters.has(letter));
    });
}

function scrollToLetterInSection(letter, sectionType) {
    const items = Array.from(document.querySelectorAll(`#${sectionType}Grid .block-item`));
    const firstItem = items.find(item =>
        !item.classList.contains('hidden') &&
        item.querySelector('.block-name').textContent.trim().toUpperCase().startsWith(letter)
    );

    if (firstItem) {
        const header = document.querySelector('.header');
        const headerHeight = header.offsetHeight;
        const itemPosition = firstItem.getBoundingClientRect().top + window.pageYOffset;
        const currentScroll = window.pageYOffset;
        const scrollNeeded = Math.abs(currentScroll - (itemPosition - headerHeight - 100)) > 1;

        if (scrollNeeded) {
            window.scrollTo({
                top: itemPosition - headerHeight - 100,
                behavior: 'smooth'
            });

            // wait for scroll to finish, then highlight the item
            setTimeout(() => {
                firstItem.classList.add('highlight');
                setTimeout(() => firstItem.classList.remove('highlight'), 2000);
            }, 1000);
        } else {
            firstItem.classList.add('highlight');
            setTimeout(() => firstItem.classList.remove('highlight'), 2000);
        }
    }
}
//#endregion

//#region Data Loading and Grid Creation

var data_path = 'https://raw.githubusercontent.com/Jordy3D/ResourcePackSupportTracker/refs/heads/main/data/data.json';
if (window.location.href.includes('localhost') || window.location.href.includes('127.0.0.1')) {
    data_path = '../data/data.json';
}

fetch(data_path)
    .then(response => response.json())
    .then(data => {
        VALID_SECTIONS = Object.keys(data).filter(key => Array.isArray(data[key]));

        const main = document.querySelector('main');
        main.innerHTML = '';
        let totalItems = 0;

        // Sort the data by name
        Object.keys(data).forEach(key => {
            data[key].sort((a, b) => a.name.localeCompare(b.name));
        });

        // Create sections for each type that has items
        Object.entries(data).forEach(([type, items]) => {
            if (!Array.isArray(items) || items.length === 0) return;

            totalItems += items.length;

            // Create section structure
            const section = document.createElement('section');
            section.className = 'content-section';
            section.dataset.type = type;

            let section_name = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

            section.innerHTML = `
                <div class="section-header">
                    <h2>${section_name} (${items.length}/${items.length})</h2>
                    <button class="collapse-toggle">▼</button>
                    <nav id="${type}AlphaNav" class="alpha-nav"></nav>
                </div>
                <div class="section-content">
                    <div id="${type}Grid" class="grid"></div>
                </div>
            `;

            if (collapsedSections.has(type)) {
                section.classList.add('collapsed');
            }

            main.appendChild(section);
            const grid = section.querySelector(`#${type}Grid`);

            // Convert items to MCItem instances and add to grid
            items.forEach(item => {
                const mcItem = new MCItem(
                    item.name,
                    type,
                    item.image,
                    item.variants || [],
                    item.tags || []
                );
                const element = mcItem.createHtmlElement();
                itemRegistry.set(element.dataset.key, mcItem);
                grid.appendChild(element);
            });

            createSectionNavigation(type);

            // Add collapse functionality
            const header = section.querySelector('.section-header');
            header.addEventListener('click', () => {
                if (header.querySelector('.alpha-nav').contains(document.activeElement)) return;
                section.classList.toggle('collapsed');

                if (section.classList.contains('collapsed')) {
                    collapsedSections.add(type);
                } else {
                    collapsedSections.delete(type);
                }
                localStorage.setItem('collapsedSections', JSON.stringify(Array.from(collapsedSections)));
            });

            updateSectionCounter(type);
        });

        updateCounter(totalItems);
    })
    .catch(error => console.error('Error loading data:', error));
//#endregion

//#region Section Management
document.querySelectorAll('.section-header').forEach(header => {
    const collapseButton = header.querySelector('.collapse-toggle');
    collapseButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const section = header.parentElement;
        const type = section.dataset.type;
        section.classList.toggle('collapsed');

        if (section.classList.contains('collapsed')) {
            collapsedSections.add(type);
        } else {
            collapsedSections.delete(type);
        }
        localStorage.setItem('collapsedSections', JSON.stringify(Array.from(collapsedSections)));
    });
});
//#endregion

function createNoteEntry(noteData = { type: 'Note', text: '' }) {
    const entry = document.createElement('div');
    entry.className = 'note-entry';
    entry.setAttribute('draggable', false); // Set default to not draggable
    entry.dataset.type = noteData.type;
    entry.innerHTML = `
        <select title="Note type">
            ${NOTE_TYPES.map(t => `<option ${t === noteData.type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        <div class="note-content">
            <textarea title="Note content" style="display: none;">${noteData.text}</textarea>
            <div class="note-text">${noteData.text.replace(/\n/g, '<br>')}</div>
        </div>
        <div class="note-controls">
            <button class="edit-note" title="Edit note">✎</button>
            <button class="delete-note" title="Delete note">×</button>
        </div>
    `;

    const select = entry.querySelector('select');
    const textarea = entry.querySelector('textarea');
    const textDisplay = entry.querySelector('.note-text');
    const editBtn = entry.querySelector('.edit-note');

    select.addEventListener('change', () => {
        entry.dataset.type = select.value;
    });

    entry.querySelector('.delete-note').onclick = () => entry.remove();

    // Add edit functionality
    editBtn.addEventListener('click', () => {
        const isEditing = textarea.style.display !== 'none';
        if (isEditing) {
            // Switch to view mode
            textDisplay.innerHTML = textarea.value.replace(/\n/g, '<br>');
            textarea.style.display = 'none';
            textDisplay.style.display = 'block';
            editBtn.textContent = '✎';
        } else {
            // Switch to edit mode
            textarea.value = textDisplay.innerHTML.replace(/<br>/g, '\n');
            textarea.style.display = 'block';
            textDisplay.style.display = 'none';
            editBtn.textContent = '💾';
            textarea.focus();
        }
    });

    // Add drag and drop handlers
    entry.addEventListener('mousedown', (e) => {
        // Check if the click is on the handle (the ::before pseudo-element)
        const rect = entry.getBoundingClientRect();
        const isHandle = e.clientX - rect.left < 20; // 20px is the width of the handle
        
        if (isHandle) {
            entry.setAttribute('draggable', true);
        }
    });

    entry.addEventListener('dragstart', (e) => {
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    entry.addEventListener('dragend', (e) => {
        e.target.classList.remove('dragging');
        entry.setAttribute('draggable', false); // Reset draggable after drag ends
    });

    // Prevent unwanted drag starts outside the handle
    entry.addEventListener('dragstart', (e) => {
        const rect = entry.getBoundingClientRect();
        const isHandle = e.clientX - rect.left < 20;
        if (!isHandle) {
            e.preventDefault();
        }
    });

    return entry;
}

function initializeNoteContainer(container) {
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingItem = container.querySelector('.dragging');
        const siblings = [...container.querySelectorAll('.note-entry:not(.dragging)')];

        const nextSibling = siblings.find(sibling => {
            const box = sibling.getBoundingClientRect();
            const offset = e.clientY - box.top - box.height / 2;
            return offset < 0;
        });

        if (nextSibling) {
            container.insertBefore(draggingItem, nextSibling);
        } else {
            container.appendChild(draggingItem);
        }
    });
}

function createNoteModal(itemName, type) {
    const itemKey = getItemKey(itemName, type);
    const mcItem = itemRegistry.get(itemKey);
    if (!mcItem) return;

    const modal = document.createElement('div');
    modal.className = 'note-modal';

    const isDone = completedBlocks.has(itemKey);
    const needsAttention = needsAttentionItems.has(itemKey);
    const isInProgress = inProgressItems.has(itemKey);

    modal.innerHTML = `
        <div class="note-modal-content">
            <div class="modal-header">
                <div class="modal-title">
                    <div class="modal-item-image" title="${mcItem.name} preview"></div>
                    <h3>${mcItem.name}</h3>
                </div>
                <button class="close-modal" title="Close modal">×</button>
            </div>
            <div class="modal-tags">
                <span class="tag-icon" title="Item tags"></span>
                <div class="tag-container">${mcItem.tags.map(tag => `<span class="tag" title="Tag: ${tag}">${tag}</span>`).join('')}</div>
            </div>
            <div class="modal-status">
                <label for="done-checkbox" title="Mark as completed">
                    <input type="checkbox" id="done-checkbox" class="done-checkbox" ${isDone ? 'checked' : ''}>
                    Completed
                </label>
                <label for="in-progress-checkbox" title="Mark as in progress">
                    <input type="checkbox" id="in-progress-checkbox" class="in-progress-checkbox" ${isInProgress ? 'checked' : ''}>
                    In Progress
                </label>
                <label for="attention-checkbox" title="Mark as needing attention">
                    <input type="checkbox" id="attention-checkbox" class="attention-checkbox" ${needsAttention ? 'checked' : ''}>
                    Needs Attention
                </label>
            </div>
            <div class="modal-body">
                <div class="notes-container"></div>
                <div class="modal-buttons">
                    <button class="add-note" title="Add new note">+ Add Note</button>
                </div>
            </div>
        </div>
    `;

    // Setup the image using MCItem's method
    const imageContainer = modal.querySelector('.modal-item-image');
    mcItem.setupImage(imageContainer);

    // Add handlers for state changes
    const doneCheckbox = modal.querySelector('.done-checkbox');
    const attentionCheckbox = modal.querySelector('.attention-checkbox');
    const inProgressCheckbox = modal.querySelector('.in-progress-checkbox');
    const blockItem = document.querySelector(`[data-key="${itemKey}"]`);

    doneCheckbox.addEventListener('change', () => {
        if (blockItem) {
            blockItem.classList.toggle('done');
            if (blockItem.classList.contains('done')) {
                completedBlocks.add(itemKey);
            } else {
                completedBlocks.delete(itemKey);
            }
            localStorage.setItem('completedBlocks', JSON.stringify([...completedBlocks]));
            updateCounter(document.querySelectorAll('.block-item').length);
            updateSectionCounter(type);
        }
    });

    attentionCheckbox.addEventListener('change', () => {
        if (blockItem) {
            blockItem.classList.toggle('needs-attention');
            if (blockItem.classList.contains('needs-attention')) {
                needsAttentionItems.add(itemKey);
            } else {
                needsAttentionItems.delete(itemKey);
            }
            localStorage.setItem('needsAttentionItems', JSON.stringify([...needsAttentionItems]));
        }
    });

    inProgressCheckbox.addEventListener('change', () => {
        if (blockItem) {
            blockItem.classList.toggle('in-progress');
            if (blockItem.classList.contains('in-progress')) {
                inProgressItems.add(itemKey);
            } else {
                inProgressItems.delete(itemKey);
            }
            localStorage.setItem('inProgressItems', JSON.stringify([...inProgressItems]));
        }
    });

    const container = modal.querySelector('.notes-container');
    initializeNoteContainer(container);

    const addButton = modal.querySelector('.add-note');
    const closeButton = modal.querySelector('.close-modal');

    // Load existing notes
    if (itemNotes[itemKey]) {
        itemNotes[itemKey].forEach(note => {
            container.appendChild(createNoteEntry(note));
        });
    }

    // Add click outside to close
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeButton.click();
        }
    });

    addButton.onclick = () => container.appendChild(createNoteEntry());

    closeButton.onclick = () => {
        // Save notes before closing
        const notes = Array.from(container.querySelectorAll('.note-entry')).map(entry => ({
            type: entry.querySelector('select').value,
            text: entry.querySelector('textarea').value.trim()
        })).filter(note => note.text); // Only save notes with content

        if (notes.length) {
            itemNotes[itemKey] = notes;
        } else {
            delete itemNotes[itemKey];
        }
        localStorage.setItem('itemNotes', JSON.stringify(itemNotes));
        modal.remove();
    };

    document.body.appendChild(modal);
}

// Replace the existing howToUseBtn event listener with this simpler version
document.getElementById('howToUseBtn').addEventListener('click', () => {
    const helpModal = document.getElementById('helpModal');
    helpModal.classList.remove('hidden');
});

// Add click handlers for the help modal
const helpModal = document.getElementById('helpModal');
const helpCloseBtn = helpModal.querySelector('.close-modal');

helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.add('hidden');
});

helpCloseBtn.onclick = () => helpModal.classList.add('hidden');