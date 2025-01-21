//#region Initialization and State Management
const VALID_SECTIONS = ['blocks', 'mobs', 'items', 'technical_blocks'];
const NOTE_TYPES = ['Bug', 'Note', 'Todo', 'Question'];
let completedBlocks = new Set(JSON.parse(localStorage.getItem('completedBlocks') || '[]'));
const collapsedSections = new Set(JSON.parse(localStorage.getItem('collapsedSections') || '[]'));
const needsAttentionItems = new Set(JSON.parse(localStorage.getItem('needsAttentionItems') || '[]'));
const itemNotes = JSON.parse(localStorage.getItem('itemNotes') || '{}');
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
            exportData[type][name] = {
                done: block.classList.contains('done'),
                needsAttention: block.classList.contains('needs-attention'),
                notes: itemNotes[name] || []
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
            Object.keys(itemNotes).forEach(key => delete itemNotes[key]);

            // Handle both old and new format
            if (data && typeof data === 'object') {
                if (VALID_SECTIONS.some(section => data[section])) {
                    // New category-based format
                    VALID_SECTIONS.forEach(category => {
                        if (data[category] && typeof data[category] === 'object') {
                            Object.entries(data[category]).forEach(([name, states]) => {
                                if (states.done) completedBlocks.add(name);
                                if (states.needsAttention) needsAttentionItems.add(name);
                                if (states.notes && states.notes.length) {
                                    itemNotes[name] = states.notes;
                                }
                            });
                        }
                    });
                } else {
                    // Old flat format
                    Object.entries(data).forEach(([name, states]) => {
                        if (states.done) completedBlocks.add(name);
                        if (states.needsAttention) needsAttentionItems.add(name);
                        if (states.notes && states.notes.length) {
                            itemNotes[name] = states.notes;
                        }
                    });
                }

                // Save to localStorage
                localStorage.setItem('completedBlocks', JSON.stringify([...completedBlocks]));
                localStorage.setItem('needsAttentionItems', JSON.stringify([...needsAttentionItems]));
                localStorage.setItem('itemNotes', JSON.stringify(itemNotes));

                // Update UI
                document.querySelectorAll('.block-item').forEach(block => {
                    const name = block.querySelector('.block-name').textContent;
                    const section = block.closest('.content-section');
                    const type = section.dataset.type;
                    
                    // Look for the item in its correct category
                    const states = data[type]?.[name] || data[name] || {};
                    block.classList.toggle('done', !!states.done);
                    block.classList.toggle('needs-attention', !!states.needsAttention);
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
    completedCountEl.textContent = completedBlocks.size;
    totalCountEl.textContent = totalBlocks;
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
    const normalizedSearch = searchTerm.toLowerCase();
    const words = normalizedSearch.split(/\s+/);
    
    // Special filter handlers using word matching
    const isDoneFilter = words.includes('done');
    const isNotDoneFilter = words.includes('!done');
    const isAttentionFilter = words.includes('attention');
    const isNotAttentionFilter = words.includes('!attention');
    
    // Remove special filters from search term for regular text search
    const plainSearch = words
        .filter(word => !['done', '!done', 'attention', '!attention'].includes(word))
        .join(' ');

    // Uncollapse all sections when searching
    if (normalizedSearch) {
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('collapsed');
            const type = section.dataset.type;
            collapsedSections.delete(type);
        });
        localStorage.setItem('collapsedSections', JSON.stringify([...collapsedSections]));
    }

    document.querySelectorAll('.block-item').forEach(element => {
        const name = element.querySelector('.block-name').textContent.toLowerCase();
        const categories = element.dataset.categories ? element.dataset.categories.toLowerCase().split(',') : [];
        const category = element.dataset.category ? element.dataset.category.toLowerCase() : '';
        
        const isDone = element.classList.contains('done');
        const needsAttention = element.classList.contains('needs-attention');
        
        const matchesSearch = !plainSearch || 
            name.includes(plainSearch) || 
            categories.some(cat => cat.includes(plainSearch)) ||
            category.includes(plainSearch);
            
        const matchesDoneFilter = !isDoneFilter || isDone;
        const matchesNotDoneFilter = !isNotDoneFilter || !isDone;
        const matchesAttentionFilter = !isAttentionFilter || needsAttention;
        const matchesNotAttentionFilter = !isNotAttentionFilter || !needsAttention;
        
        const matchesAll = matchesSearch && 
            matchesDoneFilter && 
            matchesNotDoneFilter && 
            matchesAttentionFilter && 
            matchesNotAttentionFilter;
        
        element.classList.toggle('hidden', !matchesAll);
    });

    // Update section counters with search results
    VALID_SECTIONS.forEach(type => {
        updateSectionCounter(type, normalizedSearch !== '');
        updateSectionNavAvailability(type);
    });
}

searchInput.addEventListener('input', (e) => {
    const hasValue = e.target.value.length > 0;
    searchClear.classList.toggle('visible', hasValue);
    filterItems(e.target.value);
});

searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.classList.remove('visible');
    filterItems('');
    searchInput.focus();
    // Reset counters to normal state
    VALID_SECTIONS.forEach(type => updateSectionCounter(type, false));
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
        const main = document.querySelector('main');
        main.innerHTML = ''; // Clear existing content
        let totalItems = 0;

        // sort the data by name
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

            let section_name = type;
            // replace underscores with spaces and capitalize first letter of each word
            section_name = section_name.replace(/_/g, ' ');
            section_name = section_name.replace(/\b\w/g, l => l.toUpperCase());

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

            // Get the grid for this section
            const grid = section.querySelector(`#${type}Grid`);

            // Add items to grid
            items.forEach(item => {
                const element = document.createElement('div');
                element.className = 'block-item' + 
                    (completedBlocks.has(item.name) ? ' done' : '') +
                    (needsAttentionItems.has(item.name) ? ' needs-attention' : '');

                // Add category data attributes
                if (item.category) {
                    element.dataset.category = item.category;
                }
                if (item.categories && Array.isArray(item.categories)) {
                    element.dataset.categories = item.categories.join(',');
                }

                // Create base element structure
                element.innerHTML = `
                    <button class="info-button">ℹ</button>
                    <div class="item-content"></div>
                `;

                const itemContent = element.querySelector('.item-content');
                const infoButton = element.querySelector('.info-button');

                infoButton.onclick = (e) => {
                    e.stopPropagation();
                    createNoteModal(item.name, type);
                };

                const imageName = item.image;
                const imageExt = imageName.split('.').pop();
                const hasVariants = item.variants && Array.isArray(item.variants) && item.variants.length > 0;

                if (hasVariants) {
                    // Variant handling code
                    element.dataset.variants = JSON.stringify(item.variants);
                    element.dataset.currentVariant = '0';
                    element.dataset.baseName = item.image.split('.')[0];
                    element.dataset.ext = imageExt;

                    item.image = `${item.image.split('.')[0]}_${item.variants[0]}.${imageExt}`;

                    // spawn all variant images and hide them
                    item.variants.forEach((variant, idx) => {
                        const img = new Image();
                        name = item.name.replace(' ', '_');
                        variant = variant.replace(' ', '_');

                        img.src = `images/${type}/${name}_${variant}.${imageExt}`;
                        img.alt = item.name;
                        img.style.display = idx === 0 ? 'block' : 'none';
                        img.className = 'variant-image';
                        itemContent.appendChild(img);
                    });

                    setInterval(() => {
                        const currentVariant = parseInt(element.dataset.currentVariant);
                        const nextVariant = (currentVariant + 1) % item.variants.length;

                        element.dataset.currentVariant = nextVariant;
                        element.querySelector('.variant-image:nth-child(' + (currentVariant + 1) + ')').style.display = 'none';
                        element.querySelector('.variant-image:nth-child(' + (nextVariant + 1) + ')').style.display = 'block';
                    }, 1000);

                } else {
                    // Regular item display
                    itemContent.innerHTML = `
                        <img src="images/${type}/${item.image}" alt="${item.name}" onerror="this.src='images/missing.webp'">
                    `;
                }

                // Add name after content
                const blockName = document.createElement('div');
                blockName.className = 'block-name';
                blockName.textContent = item.name;
                element.appendChild(blockName);

                element.addEventListener('click', (e) => {
                    if (e.ctrlKey || e.metaKey) {  // Check for both Ctrl and Cmd
                        e.preventDefault();  // Prevent browser's default Ctrl+click behavior
                        element.classList.toggle('needs-attention');
                        if (element.classList.contains('needs-attention')) {
                            needsAttentionItems.add(item.name);
                        } else {
                            needsAttentionItems.delete(item.name);
                        }
                        localStorage.setItem('needsAttentionItems', JSON.stringify([...needsAttentionItems]));
                        return;
                    }

                    // Regular click handling
                    element.classList.toggle('done');
                    if (element.classList.contains('done')) {
                        completedBlocks.add(item.name);
                    } else {
                        completedBlocks.delete(item.name);
                    }
                    updateCounter(totalItems);
                    updateSectionCounter(type); // Add this line
                    localStorage.setItem('completedBlocks', JSON.stringify([...completedBlocks]));
                });

                grid.appendChild(element);
            });

            // Create navigation for this section
            createSectionNavigation(type);

            // Add collapse functionality
            const header = section.querySelector('.section-header');
            header.addEventListener('click', () => {
                // if the click is on the alpha nav, don't toggle collapse
                if (header.querySelector('.alpha-nav').contains(document.activeElement)) return;
                section.classList.toggle('collapsed');
                
                if (section.classList.contains('collapsed')) {
                    collapsedSections.add(type);
                } else {
                    collapsedSections.delete(type);
                }
                localStorage.setItem('collapsedSections', JSON.stringify(Array.from(collapsedSections)));
            });

            // After adding all items to grid:
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

function createNoteModal(itemName, type) {
    const modal = document.createElement('div');
    modal.className = 'note-modal';
    modal.innerHTML = `
        <div class="note-modal-content">
            <div class="modal-header">
                <h3>Notes for ${itemName}</h3>
                <button class="close-modal">×</button>
            </div>
            <div class="modal-body">
                <div class="notes-container"></div>
                <div class="modal-buttons">
                    <button class="add-note">+ Add Note</button>
                </div>
            </div>
        </div>
    `;

    function createNoteEntry(noteData = { type: 'Note', text: '' }) {
        const entry = document.createElement('div');
        entry.className = 'note-entry';
        entry.innerHTML = `
            <select>
                ${NOTE_TYPES.map(t => `<option ${t === noteData.type ? 'selected' : ''}>${t}</option>`).join('')}
            </select>
            <textarea>${noteData.text}</textarea>
            <button class="delete-note">×</button>
        `;

        entry.querySelector('.delete-note').onclick = () => entry.remove();
        return entry;
    }

    const container = modal.querySelector('.notes-container');
    const addButton = modal.querySelector('.add-note');
    const closeButton = modal.querySelector('.close-modal');

    // Load existing notes
    if (itemNotes[itemName]) {
        itemNotes[itemName].forEach(note => {
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
            itemNotes[itemName] = notes;
        } else {
            delete itemNotes[itemName];
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