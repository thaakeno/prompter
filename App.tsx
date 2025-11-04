import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { View, Settings, HistoryItem, PromptTemplate, BundledTemplate } from './types';
import useIndexedDB from './hooks/useIndexedDB';
import { streamEnhancePrompt, generateTemplateMetadata, generateBatchTemplateMetadata } from './services/geminiService';
import { clearStore } from './services/db';
import * as db from './services/db';
import { 
    IconSettings, IconCopy, IconX, IconCheck, IconText, IconCode, 
    IconImage, IconHistory, IconLayoutTemplate, IconTrash, IconPlus, 
    IconChevronDown, IconZap, IconSend, IconUploadCloud, IconVideo, IconEdit, IconLayers, IconSliders, IconBookOpen, IconDownload,
    IconBrain, IconPackage, IconSearch, IconRotateCw, IconSave, IconBarChart, IconFilm, IconHelpCircle
} from './components/Icons';

// --- UTILITY FUNCTIONS ---
const fileToBase64 = (file: File): Promise<{base64: string, type: string}> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve({ base64, type: file.type });
    };
    reader.onerror = error => reject(error);
  });
};

const playVideoWithSound = (event: React.MouseEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    video.muted = false;
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Video autoplay with sound failed, browser might be blocking it.", error);
            // We don't fallback to muted play, as the goal is to play with sound.
        });
    }
};

const pauseVideo = (event: React.MouseEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    video.pause();
    video.currentTime = 0;
    video.muted = true;
};

const isAistudioEnvironment = () => typeof (window as any).aistudio !== 'undefined';

// --- UI COMPONENTS ---

const Toast = ({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const styles = {
    success: 'bg-green-500/10 border-green-500/50 text-green-300',
    error: 'bg-red-500/10 border-red-500/50 text-red-300',
  };

  return (
    <div className={`toast visible ${styles[type]}`}>
      {message}
    </div>
  );
};

const Modal = ({ isOpen, onClose, title, children, className }: { isOpen: boolean, onClose: () => void, title: string, children?: React.ReactNode, className?: string }) => {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay visible" onClick={onClose}>
            <div className={`modal ${className || ''}`} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button onClick={onClose} className="modal-close btn">
                        <IconX className="w-5 h-5" />
                    </button>
                </div>
                <div className="modal-body">
                  {children}
                </div>
            </div>
        </div>
    );
};

const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, children }: { isOpen: boolean, onClose: () => void, onConfirm: () => void, title: string, children?: React.ReactNode }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-6">
                <p className="text-[var(--text-secondary)] text-center">{children}</p>
                <div className="modal-footer !pt-4 !border-t-0 flex-col sm:flex-row">
                    <button onClick={onClose} className="btn-secondary btn w-full justify-center">Cancel</button>
                    <button 
                        onClick={() => { onConfirm(); onClose(); }} 
                        className="btn-primary btn w-full justify-center !bg-red-600 hover:!bg-red-700 !border-red-500/50 hover:!border-red-500/80 shadow-lg !shadow-red-500/20"
                    >
                        Confirm Delete
                    </button>
                </div>
            </div>
        </Modal>
    );
};


const SettingsModal = ({ settings, setSettings, isOpen, onClose, onClearHistory, onClearTemplates, onExportData, onImportData, isAistudio }: { 
    settings: Settings, 
    setSettings: (s: Settings) => void, 
    isOpen: boolean, 
    onClose: () => void,
    onClearHistory: () => void,
    onClearTemplates: () => void,
    onExportData: () => void,
    onImportData: () => void,
    isAistudio: boolean,
}) => {
    const [localSettings, setLocalSettings] = useState(settings);

    useEffect(() => {
        setLocalSettings(settings);
    }, [isOpen, settings]);

    const handleSave = () => {
        setSettings(localSettings);
        onClose();
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Settings">
            <div className="space-y-6">
                 <div className="setting-item">
                    <label className="setting-label">
                        <span>API Key Configuration</span>
                    </label>
                    
                    {isAistudio && (
                        <div className="mb-4 flex justify-center">
                            <SlidingTabControl
                                options={[
                                    { value: 'environment', label: <><IconZap className="w-4 h-4"/> Environment</> },
                                    { value: 'custom', label: <><IconEdit className="w-4 h-4"/> Custom</> }
                                ]}
                                value={localSettings.apiKeySource}
                                onChange={(v) => setLocalSettings(s => ({...s, apiKeySource: v as any}))}
                            />
                        </div>
                    )}

                    {(!isAistudio || localSettings.apiKeySource === 'custom') && (
                        <div className="space-y-2">
                             <input 
                              type="password"
                              value={localSettings.apiKey}
                              onChange={(e) => setLocalSettings(s => ({...s, apiKey: e.target.value}))}
                              placeholder="Enter your Gemini API key"
                              className="setting-input"
                            />
                            <p className="setting-description">
                                {isAistudio 
                                    ? "Your key is stored locally and only used for requests from this tool."
                                    : "Your key is stored locally in your browser's IndexedDB. An API key is required."
                                }
                            </p>
                        </div>
                    )}

                     {isAistudio && localSettings.apiKeySource === 'environment' && (
                        <p className="setting-description text-center bg-[var(--bg-tertiary)] p-3 rounded-lg border border-[var(--border-primary)]">
                            The app will use the API key provided by the AI Studio environment.
                        </p>
                    )}
                </div>

                <div className="setting-item pt-4 border-t border-[var(--border-primary)]">
                    <h3 className="setting-label mb-4">
                        <span>Data Management</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <button onClick={onImportData} className="btn-secondary btn w-full justify-center">
                            <IconUploadCloud className="w-4 h-4 mr-2"/> Import Data
                        </button>
                        <button onClick={onExportData} className="btn-secondary btn w-full justify-center">
                            <IconDownload className="w-4 h-4 mr-2"/> Export Data
                        </button>
                        <button onClick={onClearHistory} className="btn-secondary btn w-full justify-center text-red-400 border-red-500/50 hover:bg-red-500/10 hover:border-red-500/80">
                            <IconTrash className="w-4 h-4 mr-2"/> Clear History
                        </button>
                         <button onClick={onClearTemplates} className="btn-secondary btn w-full justify-center text-red-400 border-red-500/50 hover:bg-red-500/10 hover:border-red-500/80">
                            <IconTrash className="w-4 h-4 mr-2"/> Clear All Templates & Bundles
                        </button>
                    </div>
                     <p className="setting-description mt-2">Import/Export allows you to save and load all your data to a file. Clearing data is irreversible.</p>
                </div>

                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                    <button onClick={handleSave} className="btn-primary btn">Save Settings</button>
                </div>
            </div>
        </Modal>
    );
};

const WelcomeModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void; }) => {
    const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

    const features = [
        { id: 'ai-enhancement', icon: <IconZap className="w-5 h-5" />, title: 'AI Enhancement', description: 'Transform simple ideas into rich, detailed prompts in text or JSON format for cinematic results.' },
        { id: 'media-driven', icon: <IconImage className="w-5 h-5" />, title: 'Media-Driven Prompts', description: 'Upload images or videos, and the AI will generate contextual motion descriptions for them.' },
        { id: 'library', icon: <IconLayoutTemplate className="w-5 h-5" />, title: 'Reusable Library', description: 'Save, tag, and bundle your best prompts as templates for easy reuse and organization.' },
        { id: 'controls', icon: <IconSliders className="w-5 h-5" />, title: 'Creative Controls', description: 'Fine-tune generation style, length, and AI reasoning to achieve the perfect output for your vision.' },
    ];

    const handleToggle = (id: string) => {
        setExpandedFeature(prev => prev === id ? null : id);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="" className="welcome-modal">
            <div className="welcome-modal-content">
                <div className="welcome-logo-simple">
                    <IconZap />
                </div>
                <h1 className="welcome-title">Welcome to Prompt Architect</h1>
                <p className="welcome-subtitle">Your AI co-director for crafting cinematic video prompts.</p>
                
                <div className="welcome-features-list">
                    {features.map(feature => (
                        <div key={feature.id} className={`welcome-feature-item ${expandedFeature === feature.id ? 'expanded' : ''}`}>
                            <button className="welcome-feature-pill" onClick={() => handleToggle(feature.id)}>
                                <div className="flex items-center gap-3">
                                    <div className="welcome-feature-icon">{feature.icon}</div>
                                    <span>{feature.title}</span>
                                </div>
                                <IconChevronDown className="pill-chevron" />
                            </button>
                            <div className="welcome-feature-content">
                                <p>{feature.description}</p>
                            </div>
                        </div>
                    ))}
                </div>

                <div className="modal-footer !pt-6 !border-t-0">
                    <button onClick={onClose} className="btn-primary btn !text-base !px-8 !py-2.5 !rounded-full">
                        Get Started
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const TemplateCard = React.memo(({ template, setToast, setTemplates, onOpenEditModal, usageCount, isInBundleEditor = false }: {
  template: PromptTemplate;
  setToast: (toast: {message: string, type: 'success' | 'error'}) => void;
  setTemplates: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
  onOpenEditModal: (template: PromptTemplate) => void;
  usageCount: number;
  isInBundleEditor?: boolean;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleCopy = () => {
    navigator.clipboard.writeText(template.prompt);
    setToast({message: 'Prompt copied!', type: 'success'});
  };

  return (
      <div className="template-card-container">
        <div className={`template-card-flipper ${isFlipped ? 'is-flipped' : ''}`}>
            {/* --- FRONT FACE --- */}
            <div className="template-card-face template-card-front">
                <div className="template-card-media">
                    {usageCount > 0 && (
                        <div className="usage-count-badge">
                            <IconBarChart className="w-3 h-3 text-green-400"/>
                            <span>{usageCount}</span>
                        </div>
                    )}
                    {template.exampleVideo && template.exampleVideoType ? (
                        <video
                            ref={videoRef}
                            src={`data:${template.exampleVideoType};base64,${template.exampleVideo}`}
                            className="template-card-video-bg"
                            loop
                            muted
                            playsInline
                            onMouseEnter={playVideoWithSound}
                            onMouseLeave={pauseVideo}
                        />
                    ) : (
                      <div className="template-card-placeholder">
                          <IconVideo className="w-12 h-12 text-[var(--border-secondary)]"/>
                      </div>
                    )}
                </div>
                <div className="template-card-content">
                    <div className="template-card-scrollable-content">
                        <h3 className="template-card-title">{template.title}</h3>
                        <p className="template-card-description">{template.description}</p>
                        <div className="template-card-tags">
                            {template.models.map(m => <span key={m} className="tag-model">{m}</span>)}
                            {template.tags.map(t => <span key={t} className="tag-general">{t}</span>)}
                        </div>
                    </div>
                    {!isInBundleEditor && (
                        <div className="template-card-actions">
                            <button onClick={() => setIsFlipped(true)} className="view-prompt-btn">
                                <IconBookOpen className="w-4 h-4 mr-2"/> 
                                <span>View Prompt</span>
                            </button>
                            <div className="template-card-icon-actions">
                                <button onClick={() => onOpenEditModal(template)} className="icon-action-btn" aria-label="Edit template">
                                    <IconEdit className="w-4 h-4"/>
                                </button>
                                <button onClick={() => {
                                    setTemplates(prev => prev.filter(t => t.id !== template.id));
                                    setToast({message: 'Template deleted.', type: 'success'});
                                }} className="icon-action-btn delete" aria-label="Delete template">
                                    <IconTrash className="w-4 h-4"/>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            {/* --- BACK FACE --- */}
            <div className="template-card-face template-card-back">
                <div className="template-card-back-header">
                    <h4 className="template-card-back-title">Template Prompt</h4>
                    <button onClick={() => setIsFlipped(false)} className="btn !p-2 !rounded-full !bg-transparent hover:!bg-[var(--border-primary)] !border-0">
                        <IconX className="w-4 h-4" />
                    </button>
                </div>
                <div className="template-card-back-prompt-wrapper">
                    <pre className="template-card-back-prompt">
                        {template.prompt}
                    </pre>
                </div>
                <div className="template-card-back-footer">
                    <button onClick={handleCopy} className="btn btn-primary w-full justify-center">
                        <IconCopy className="w-4 h-4 mr-2" />
                        Copy Prompt
                    </button>
                </div>
            </div>
        </div>
      </div>
  );
});


const SlidingTabControl = ({ options, value, onChange, disabled = false, className = '' }: {
    options: { value: string; label: React.ReactNode }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}) => {
    const activeIndex = options.findIndex(opt => opt.value === value);
    const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [highlightStyle, setHighlightStyle] = useState({});

    useEffect(() => {
        if (activeIndex !== -1 && itemRefs.current[activeIndex]) {
            const activeItem = itemRefs.current[activeIndex]!;
            setHighlightStyle({
                width: activeItem.offsetWidth,
                transform: `translateX(${activeItem.offsetLeft}px)`,
            });
        }
    }, [activeIndex, options, value]);

    return (
        <div className={`sliding-tab-control ${disabled ? 'disabled' : ''} ${className}`}>
            <div className="sliding-tab-highlight" style={highlightStyle}></div>
            {options.map((option, index) => (
                <button
                    key={option.value}
                    ref={el => { itemRefs.current[index] = el; }}
                    onClick={() => onChange(option.value)}
                    className={`sliding-tab-option ${value === option.value ? 'active' : ''}`}
                    disabled={disabled}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};


const MultiTagFilterDropdown = ({ allTags, selectedTags, onSelectionChange, disabled = false }: {
    allTags: string[];
    selectedTags: string[];
    onSelectionChange: (tags: string[]) => void;
    disabled?: boolean;
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredTags = useMemo(() => {
        return allTags.filter(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allTags, searchTerm]);

    const handleToggleTag = (tag: string) => {
        const newSelection = new Set(selectedTags);
        if (newSelection.has(tag)) {
            newSelection.delete(tag);
        } else {
            newSelection.add(tag);
        }
        onSelectionChange(Array.from(newSelection));
    };

    const buttonLabel = selectedTags.length > 0 ? `Tags (${selectedTags.length})` : 'Filter by Tag';

    return (
        <div className="multi-tag-filter-dropdown" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="multi-tag-filter-button"
                disabled={disabled}
            >
                <span>{buttonLabel}</span>
                <IconChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !disabled && (
                <div className="multi-tag-filter-panel">
                    <div className="multi-tag-filter-header">
                        <input
                            type="text"
                            placeholder="Search tags..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="multi-tag-search-input"
                        />
                         <button onClick={() => onSelectionChange([])} className="multi-tag-clear-btn">Clear</button>
                    </div>
                    <ul className="multi-tag-list">
                        {filteredTags.map(tag => {
                            const isSelected = selectedTags.includes(tag);
                            return (
                                <li key={tag} onClick={() => handleToggleTag(tag)} className={`multi-tag-list-item ${isSelected ? 'selected' : ''}`}>
                                    <div className="custom-checkbox">
                                        {isSelected && <IconCheck className="w-3 h-3 text-white" />}
                                    </div>
                                    <span>{tag}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
};

// --- VIEWS ---

const QuickAddPanel = React.memo(({ 
    isOpen, 
    allTemplates,
    allBundles,
    tagUsageCounts,
    selectedTags,
    setSelectedTags,
    selectedBundles,
    setSelectedBundles,
    selectedIndividualTemplates,
    setSelectedIndividualTemplates,
    usageCounts,
}: { 
    isOpen: boolean; 
    allTemplates: PromptTemplate[];
    allBundles: BundledTemplate[];
    tagUsageCounts: Map<string, number>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    selectedBundles: BundledTemplate[];
    setSelectedBundles: React.Dispatch<React.SetStateAction<BundledTemplate[]>>;
    selectedIndividualTemplates: PromptTemplate[];
    setSelectedIndividualTemplates: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
    usageCounts: Map<string, number>;
}) => {
    const [activeTab, setActiveTab] = useState('tags');
    const [search, setSearch] = useState('');
    const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([]);
    
    const allTagsWithCounts = useMemo(() => Array.from(tagUsageCounts.entries()).map(([name, count]) => ({ name, count })).sort((a,b) => b.count - a.count), [tagUsageCounts]);
    const allFilterableTags = useMemo(() => Array.from(tagUsageCounts.keys()).sort(), [tagUsageCounts]);

    const filteredTags = useMemo(() => allTagsWithCounts.filter(tag => tag.name.toLowerCase().includes(search.toLowerCase())), [allTagsWithCounts, search]);
    const filteredBundles = useMemo(() => allBundles.filter(b => b.name.toLowerCase().includes(search.toLowerCase())), [allBundles, search]);

    const filteredTemplates = useMemo(() => {
        return allTemplates.filter(t => {
            const searchLower = search.toLowerCase();
            const matchesSearch = 
                t.title.toLowerCase().includes(searchLower) || 
                t.description.toLowerCase().includes(searchLower) ||
                t.prompt.toLowerCase().includes(searchLower);
            
            const matchesTags = selectedFilterTags.length === 0 || selectedFilterTags.every(tag => t.tags.includes(tag));

            return matchesSearch && matchesTags;
        });
    }, [allTemplates, search, selectedFilterTags]);

    const toggleTag = (tag: string) => {
        setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
    };

    const toggleBundle = (bundle: BundledTemplate) => {
        setSelectedBundles(prev => prev.some(b => b.id === bundle.id) ? prev.filter(b => b.id !== bundle.id) : [...prev, bundle]);
    };
    
    const toggleTemplate = (template: PromptTemplate) => {
        setSelectedIndividualTemplates(prev => {
            if (prev.some(t => t.id === template.id)) {
                return prev.filter(t => t.id !== template.id);
            } else {
                return [...prev, template];
            }
        });
    };
    
    const dummyFn = useCallback(() => {}, []);


    return (
        <div className={`quick-add-panel ${isOpen ? 'open' : ''} ${activeTab === 'templates' ? 'templates-active' : ''}`}>
            <div className="quick-add-panel-inner">
                <div className="quick-add-header">
                    <SlidingTabControl 
                        options={[ 
                            { value: 'tags', label: '@ Tags' }, 
                            { value: 'bundles', label: '# Bundles' },
                            { value: 'templates', label: <><IconLayoutTemplate className="w-4 h-4"/> Templates</> }
                        ]} 
                        value={activeTab} 
                        onChange={v => { setActiveTab(v); setSearch(''); setSelectedFilterTags([]); }} 
                    />
                </div>
                
                <div className="quick-add-filters-wrapper">
                    <div className="quick-add-search flex-grow">
                        <IconSearch className="w-4 h-4 search-icon" />
                        <input type="text" placeholder={`Search ${activeTab}...`} value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    {activeTab === 'templates' && (
                        <MultiTagFilterDropdown
                            allTags={allFilterableTags}
                            selectedTags={selectedFilterTags}
                            onSelectionChange={setSelectedFilterTags}
                            disabled={allFilterableTags.length === 0}
                        />
                    )}
                </div>
                
                <div className={`quick-add-list ${activeTab === 'templates' ? 'templates-grid' : ''}`}>
                    {activeTab === 'tags' && filteredTags.map(tag => (
                        <button key={tag.name} className={`quick-add-item tag ${selectedTags.includes(tag.name) ? 'selected' : ''}`} onClick={() => toggleTag(tag.name)}>
                            <span className="truncate">{tag.name}</span>
                            <span className="tag-usage-count">{tag.count}</span>
                        </button>
                    ))}
                    {activeTab === 'bundles' && filteredBundles.map(bundle => (
                        <button key={bundle.id} className={`quick-add-item bundle ${selectedBundles.some(b => b.id === bundle.id) ? 'selected' : ''}`} onClick={() => toggleBundle(bundle)}>
                            <IconPackage className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                            <div className="flex flex-col text-left min-w-0">
                                <span className="font-semibold truncate">{bundle.name}</span>
                            </div>
                            <span className="tag-usage-count ml-auto">{bundle.templateIds.length}</span>
                        </button>
                    ))}
                    {activeTab === 'templates' && (
                        allTemplates.length === 0 ? (
                            <div className="quick-add-empty-state">
                                <IconLayoutTemplate className="w-12 h-12"/>
                                <h3>No Templates Yet</h3>
                                <p>Create templates from your history to reuse them here.</p>
                            </div>
                        ) : filteredTemplates.length === 0 ? (
                             <div className="quick-add-empty-state">
                                <IconSearch className="w-12 h-12"/>
                                <h3>No Matches Found</h3>
                                <p>Try adjusting your search or filters.</p>
                            </div>
                        ) : (
                           filteredTemplates.map(template => {
                                const isSelected = selectedIndividualTemplates.some(t => t.id === template.id);
                                return (
                                    <div 
                                        key={template.id}
                                        className={`quick-add-template-card-wrapper ${isSelected ? 'selected' : ''}`}
                                        onClick={() => toggleTemplate(template)}
                                    >
                                        <TemplateCard
                                            template={template}
                                            setToast={dummyFn}
                                            setTemplates={dummyFn}
                                            onOpenEditModal={dummyFn}
                                            usageCount={usageCounts.get(template.id) || 0}
                                            isInBundleEditor={true}
                                        />
                                        {isSelected && (
                                            <div className="minimal-selection-indicator">
                                                <IconCheck className="w-4 h-4 text-white"/>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )
                    )}
                </div>
            </div>
        </div>
    )
});


const PrompterView = ({ 
    settings, 
    setHistory, 
    allTemplates,
    allBundles,
    tagUsageCounts,
    isAistudio,
    onViewTemplate,
    usageCounts,
    // Lifted State
    prompt, setPrompt,
    isJsonMode, setIsJsonMode,
    useMarsLsp, setUseMarsLsp,
    media, setMedia,
    style, setStyle,
    length, setLength,
    useReasoning, setUseReasoning,
    selectedTags, setSelectedTags,
    selectedBundles, setSelectedBundles,
    selectedIndividualTemplates, setSelectedIndividualTemplates,
    setToast,
}: { 
    settings: Settings; 
    setHistory: React.Dispatch<React.SetStateAction<HistoryItem[]>>; 
    allTemplates: PromptTemplate[];
    allBundles: BundledTemplate[];
    tagUsageCounts: Map<string, number>;
    isAistudio: boolean;
    onViewTemplate: (template: PromptTemplate) => void;
    usageCounts: Map<string, number>;
    // Lifted State Props
    prompt: string;
    setPrompt: React.Dispatch<React.SetStateAction<string>>;
    isJsonMode: boolean;
    setIsJsonMode: React.Dispatch<React.SetStateAction<boolean>>;
    useMarsLsp: boolean;
    setUseMarsLsp: React.Dispatch<React.SetStateAction<boolean>>;
    media: { file: File, url: string, type: string } | null;
    setMedia: React.Dispatch<React.SetStateAction<{ file: File, url: string, type: string } | null>>;
    style: 'default' | 'anime' | 'realistic';
    setStyle: React.Dispatch<React.SetStateAction<'default' | 'anime' | 'realistic'>>;
    length: 'default' | 'short' | 'long';
    setLength: React.Dispatch<React.SetStateAction<'default' | 'short' | 'long'>>;
    useReasoning: boolean;
    setUseReasoning: React.Dispatch<React.SetStateAction<boolean>>;
    selectedTags: string[];
    setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
    selectedBundles: BundledTemplate[];
    setSelectedBundles: React.Dispatch<React.SetStateAction<BundledTemplate[]>>;
    selectedIndividualTemplates: PromptTemplate[];
    setSelectedIndividualTemplates: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
    setToast: (toast: {message: string, type: 'success' | 'error'}) => void;
}) => {
    const [isLoading, setIsLoading] = useState(false);
    const [generatedPrompt, setGeneratedPrompt] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    
    const [creativeControlsOpen, setCreativeControlsOpen] = useState(false);
    const [quickAddOpen, setQuickAddOpen] = useState(false);
    
    const [expandedPill, setExpandedPill] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const styleOptions = [ { value: 'default', label: 'Default' }, { value: 'anime', label: 'Anime' }, { value: 'realistic', label: 'Realistic' } ];
    const lengthOptions = [ { value: 'default', label: 'Default' }, { value: 'short', label: 'Short' }, { value: 'long', label: 'Long' } ];

    const activeControlsCount = useMemo(() => {
        let count = 0;
        if (style !== 'default') count++;
        if ((isJsonMode || useMarsLsp) && length !== 'default') count++;
        if (useMarsLsp) count++;
        return count;
    }, [style, length, isJsonMode, useMarsLsp]);

    const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setMedia({ file, url: URL.createObjectURL(file), type: file.type });
        }
    };

    const handleSubmit = useCallback(async () => {
        if (!prompt && !media) {
            setError('Please enter a prompt or upload media.');
            return;
        }
        
        setIsLoading(true);
        setGeneratedPrompt('');
        setError(null);

        let apiKeyToUse = '';
        if (isAistudio && settings.apiKeySource === 'environment') {
            apiKeyToUse = process.env.API_KEY || '';
        } else {
            apiKeyToUse = settings.apiKey;
        }

        if (!apiKeyToUse) {
            setError('API Key is missing. Please configure it in settings.');
            setIsLoading(false);
            return;
        }

        const templatesFromTags = allTemplates.filter(t => selectedTags.some(tag => t.tags.includes(tag)));
        const templatesFromBundles = allTemplates.filter(t => selectedBundles.some(bundle => bundle.templateIds.includes(t.id)));
        const allReferencedTemplates = [...new Map([
            ...templatesFromTags, 
            ...templatesFromBundles, 
            ...selectedIndividualTemplates
        ].map(item => [item.id, item])).values()];

        try {
            let mediaData;
            if (media) {
                const { base64, type } = await fileToBase64(media.file);
                mediaData = { base64, mimeType: type };
            }

            const responseStream = await streamEnhancePrompt({
                prompt, isJsonMode, useMarsLsp, style, length,
                thinkingBudget: useReasoning ? 24576 : 0,
                apiKey: apiKeyToUse, media: mediaData,
                referencedTemplates: allReferencedTemplates,
            });

            let fullResponse = '';
            for await (const chunk of responseStream) {
                const text = chunk.text;
                if (text) {
                    fullResponse += text;
                    setGeneratedPrompt(prev => prev + text);
                }
            }
            
            if (fullResponse) {
                 const userPromptForHistory = media 
                    ? (prompt ? `${prompt} (media: ${media.file.name})` : `Media: ${media.file.name}`)
                    : prompt;

                const historyItemConfig = { style, length, isJsonMode, useReasoning, useMarsLsp };

                 setHistory(prev => [{
                    id: crypto.randomUUID(),
                    userPrompt: userPromptForHistory,
                    generatedPrompt: fullResponse,
                    timestamp: Date.now(),
                    model: 'gemini-2.5-flash',
                    mode: isJsonMode ? 'JSON' : 'Text',
                    config: historyItemConfig,
                    referencedTemplates: allReferencedTemplates.map(t => t.id),
                    referencedBundles: selectedBundles.map(b => b.id),
                }, ...prev]);
            }
        } catch (e: any) {
            setError(e.message || 'An unknown error occurred.');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    }, [prompt, media, settings, isJsonMode, setHistory, selectedTags, selectedBundles, selectedIndividualTemplates, style, length, useReasoning, useMarsLsp, allTemplates, isAistudio]);

    const handleCopy = () => {
        navigator.clipboard.writeText(generatedPrompt);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    
    return (
        <div className="prompt-container">
            <div className="input-section">
                <label htmlFor="promptInput" className="input-label">Enter your basic prompt</label>
                <div className="input-wrapper">
                    <div className="attachment-container">
                        {media ? (
                            <div className="preview-container">
                                {media.type.startsWith('image/') ? (
                                    <img src={media.url} alt="Upload preview" className="media-preview" />
                                ) : (
                                    <video 
                                      src={media.url} 
                                      className="media-preview" 
                                      loop
                                      muted
                                      playsInline
                                      onMouseEnter={playVideoWithSound}
                                      onMouseLeave={pauseVideo}
                                    />
                                )}
                                <button onClick={() => setMedia(null)} className="remove-media-btn btn" aria-label="Remove media">
                                    <IconX className="w-4 h-4"/>
                                </button>
                            </div>
                        ) : (
                            <div className="attachment-buttons-wrapper">
                                 <button onClick={() => fileInputRef.current?.click()} className="attach-btn">
                                    <IconImage className="w-6 h-6"/>
                                    <span>Upload Media</span>
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="prompt-input-container">
                        <textarea id="promptInput" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="A lone samurai battles a kraken..." className="prompt-input" disabled={isLoading} />
                    </div>
                    <div className="input-glow"></div>
                </div>
                <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,video/*" className="hidden" />
            </div>

            {(selectedTags.length > 0 || selectedBundles.length > 0 || selectedIndividualTemplates.length > 0) && (
                <div className="selected-references-container">
                    {selectedTags.map(tag => {
                        const pillId = `tag-${tag}`;
                        const isExpanded = expandedPill === pillId;
                        const templatesForTag = allTemplates.filter(t => t.tags.includes(tag));
                        return (
                            <div key={tag} className="selected-reference-wrapper">
                                <button className="selected-reference-pill tag" onClick={() => setExpandedPill(p => p === pillId ? null : pillId)}>
                                    <span className="truncate max-w-xs">@{tag}</span>
                                    <IconChevronDown className={`pill-chevron ${isExpanded ? 'expanded' : ''}`} />
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedTags(p => p.filter(t => t !== tag)); }} className="remove-pill-btn" aria-label={`Remove @${tag} reference`}>
                                        <IconX className="w-3 h-3" />
                                    </button>
                                </button>
                                <div className={`pill-expansion-panel ${isExpanded ? 'open' : ''}`}>
                                    <ul className="pill-template-list">
                                        {templatesForTag.length > 0 ? templatesForTag.map(template => (
                                            <li key={template.id} className="pill-template-item" onClick={() => onViewTemplate(template)}>
                                                <IconBookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span className="truncate">{template.title}</span>
                                            </li>
                                        )) : <li className="pill-template-item empty">No templates with this tag.</li>}
                                    </ul>
                                </div>
                            </div>
                        )
                    })}
                     {selectedBundles.map(bundle => {
                        const pillId = `bundle-${bundle.id}`;
                        const isExpanded = expandedPill === pillId;
                        const templatesForBundle = allTemplates.filter(t => bundle.templateIds.includes(t.id));
                        return (
                             <div key={bundle.id} className="selected-reference-wrapper">
                                <button className="selected-reference-pill bundle" onClick={() => setExpandedPill(p => p === pillId ? null : pillId)}>
                                    <IconPackage className="w-3 h-3"/>
                                    <span className="truncate max-w-xs">{bundle.name}</span>
                                    <IconChevronDown className={`pill-chevron ${isExpanded ? 'expanded' : ''}`} />
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedBundles(p => p.filter(b => b.id !== bundle.id)); }} className="remove-pill-btn" aria-label={`Remove #${bundle.name} reference`}>
                                        <IconX className="w-3 h-3" />
                                    </button>
                                </button>
                                 <div className={`pill-expansion-panel ${isExpanded ? 'open' : ''}`}>
                                    <ul className="pill-template-list">
                                        {templatesForBundle.length > 0 ? templatesForBundle.map(template => (
                                            <li key={template.id} className="pill-template-item" onClick={() => onViewTemplate(template)}>
                                                <IconBookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                                                <span className="truncate">{template.title}</span>
                                            </li>
                                        )) : <li className="pill-template-item empty">This bundle is empty.</li>}
                                    </ul>
                                </div>
                            </div>
                        )
                    })}
                    {selectedIndividualTemplates.length > 0 && (() => {
                        const pillId = 'individual-templates';
                        const isExpanded = expandedPill === pillId;
                        return (
                            <div key={pillId} className="selected-reference-wrapper">
                                <button className="selected-reference-pill bundle" onClick={() => setExpandedPill(p => p === pillId ? null : pillId)}>
                                    <IconLayoutTemplate className="w-3 h-3 text-amber-400"/>
                                    <span className="truncate max-w-xs">Templates ({selectedIndividualTemplates.length})</span>
                                    <IconChevronDown className={`pill-chevron ${isExpanded ? 'expanded' : ''}`} />
                                    <button onClick={(e) => { e.stopPropagation(); setSelectedIndividualTemplates([]); setExpandedPill(null); }} className="remove-pill-btn" aria-label="Remove all selected templates">
                                        <IconX className="w-3 h-3" />
                                    </button>
                                </button>
                                <div className={`pill-expansion-panel ${isExpanded ? 'open' : ''}`}>
                                    <ul className="pill-template-list">
                                        {selectedIndividualTemplates.map(template => (
                                            <li key={template.id} className="pill-template-item with-remove">
                                                <div className="pill-template-item-content" onClick={() => onViewTemplate(template)}>
                                                    <IconBookOpen className="w-3.5 h-3.5 flex-shrink-0" />
                                                    <span className="truncate">{template.title}</span>
                                                </div>
                                                <button onClick={(e) => { e.stopPropagation(); setSelectedIndividualTemplates(p => p.filter(t => t.id !== template.id)); }} className="remove-from-list-btn" aria-label={`Remove ${template.title}`}>
                                                    <IconX className="w-3 h-3" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        )
                    })()}

                    <button onClick={() => { setSelectedTags([]); setSelectedBundles([]); setSelectedIndividualTemplates([]); setExpandedPill(null); }} className="clear-all-refs-btn" aria-label="Clear all references">
                        <IconX className="w-4 h-4 mr-1.5" />
                        <span>Clear</span>
                    </button>
                </div>
            )}


            <div className="generation-controls-container">
                <div className={`main-controls-wrapper ${creativeControlsOpen || quickAddOpen ? 'expanded' : ''}`}>
                    <div className="generation-controls">
                         <button className={`controls-btn ${creativeControlsOpen ? 'active' : ''}`} onClick={() => { setCreativeControlsOpen(p => !p); setQuickAddOpen(false); }}>
                            <IconSliders />
                            <span className="hidden sm:inline">Creative Controls</span>
                            {activeControlsCount > 0 && <span className="badge">{activeControlsCount}</span>}
                        </button>
                         <button className={`controls-btn quick-add-btn ${quickAddOpen ? 'active' : ''}`} onClick={() => { setQuickAddOpen(p => !p); setCreativeControlsOpen(false); }}>
                            <IconLayers />
                            <span className="hidden sm:inline">Add References</span>
                        </button>
                        
                        <div className="mode-toggles">
                            <button onClick={() => setUseReasoning(p => !p)} className={`reasoning-btn ${useReasoning ? 'active' : ''}`} title={`Reasoning Budget: ${useReasoning ? 'On (24576)' : 'Off (0)'}`}>
                                <IconBrain className="w-6 h-6"/>
                            </button>
                            <SlidingTabControl options={[{ value: 'text', label: <><IconText className="w-5 h-5"/>Text</> }, { value: 'json', label: <><IconCode className="w-5 h-5"/>JSON</> }]} value={isJsonMode ? 'json' : 'text'} onChange={(v) => setIsJsonMode(v === 'json')} className="main-toggle" />
                        </div>

                        <button onClick={handleSubmit} disabled={isLoading || (!prompt && !media)} className="generate-btn">
                            {isLoading ? <span className="btn-loading"><div className="spinner"></div>Generating...</span> : <span className="btn-content"><IconSend className="w-5 h-5" />Generate</span>}
                        </button>
                    </div>

                    <div className={`creative-controls-panel ${creativeControlsOpen ? 'open' : ''}`}>
                        <div className="creative-controls-panel-inner">
                            <div className="control-group"> <label>Style</label> <SlidingTabControl options={styleOptions} value={style} onChange={(v) => setStyle(v as any)} /> </div>
                            <div className="control-group"> <label className={!isJsonMode && !useMarsLsp ? 'disabled' : ''}>Length (JSON or MARS-LSP)</label> <SlidingTabControl options={lengthOptions} value={length} onChange={(v) => setLength(v as any)} disabled={!isJsonMode && !useMarsLsp} /> </div>
                            <div className="control-group">
                                <div className="setting-item !mb-0">
                                    <label className="setting-label !mb-2">
                                        <div className="flex items-center gap-2">
                                            <IconFilm className="w-4 h-4 text-amber-400"/>
                                            <span>MARS-LSP Director Mode</span>
                                            <div className="tooltip-container">
                                                <IconHelpCircle className="w-4 h-4 text-gray-500"/>
                                                <div className="tooltip">
                                                    <h4 className="font-bold mb-2">MARS-LSP (Long Scene Prompting)</h4>
                                                    <p className="mb-2">A method for creating detailed, timestamped scripts to direct the AI video model with high precision.</p>
                                                    <p className="mb-2"><strong className="text-white">With Text Mode:</strong> Generates a human-readable script with beats like [CAMERA], [SUBJECT], [SND], etc.</p>
                                                    <p><strong className="text-white">With JSON Mode:</strong> Generates a structured JSON object with a `mars_lsp_script` array, perfect for programmatic use.</p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="switch" onClick={() => setUseMarsLsp(p => !p)}>
                                            <div className={`slider round ${useMarsLsp ? 'checked' : ''}`}></div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </div>
                    <QuickAddPanel 
                        isOpen={quickAddOpen}
                        allTemplates={allTemplates}
                        allBundles={allBundles}
                        tagUsageCounts={tagUsageCounts}
                        selectedTags={selectedTags}
                        setSelectedTags={setSelectedTags}
                        selectedBundles={selectedBundles}
                        setSelectedBundles={setSelectedBundles}
                        selectedIndividualTemplates={selectedIndividualTemplates}
                        setSelectedIndividualTemplates={setSelectedIndividualTemplates}
                        usageCounts={usageCounts}
                    />
                </div>
            </div>
            
            {error && <div className="text-center text-red-400 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">{error}</div>}
            {isLoading && !generatedPrompt && <div className="thinking-indicator justify-center" style={{display: 'flex'}}><div className="thinking-dots"><span></span><span></span><span></span></div></div>}
            {generatedPrompt && <div className="output-section visible"><div className="output-wrapper"><pre className="output-content">{generatedPrompt}</pre><button onClick={handleCopy} className="copy-btn btn" aria-label="Copy prompt">{copied ? <IconCheck className="w-5 h-5 text-green-400" /> : <IconCopy className="w-5 h-5" />}</button></div></div>}
        </div>
    );
};

const HistoryView = ({ history, allTemplates, allBundles, showToast, onDeleteItem, onViewTemplate, onClearAll, onRerun, onSaveAsTemplate, isSavingTemplate }: { 
    history: HistoryItem[]; 
    allTemplates: PromptTemplate[];
    allBundles: BundledTemplate[];
    showToast: (toast: {message: string, type: 'success' | 'error'}) => void;
    onDeleteItem: (item: HistoryItem) => void;
    onViewTemplate: (template: PromptTemplate) => void;
    onClearAll: () => void;
    onRerun: (item: HistoryItem) => void;
    onSaveAsTemplate: (item: HistoryItem) => void;
    isSavingTemplate: string | null;
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [expandedBundles, setExpandedBundles] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOrder, setSortOrder] = useState('newest');

    const templatesById = useMemo(() => new Map(allTemplates.map(t => [t.id, t])), [allTemplates]);
    const bundlesById = useMemo(() => new Map(allBundles.map(b => [b.id, b])), [allBundles]);

    const filteredAndSortedHistory = useMemo(() => {
        return history
            .filter(item => 
                item.userPrompt.toLowerCase().includes(searchTerm.toLowerCase())
            )
            .sort((a, b) => {
                switch (sortOrder) {
                    case 'oldest':
                        return a.timestamp - b.timestamp;
                    case 'alpha':
                        return a.userPrompt.localeCompare(b.userPrompt);
                    case 'newest':
                    default:
                        return b.timestamp - a.timestamp;
                }
            });
    }, [history, searchTerm, sortOrder]);

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
        showToast({ message: `Prompt copied!`, type: 'success' });
    };

    const toggleBundleExpansion = (historyItemId: string, bundleId: string) => {
      const key = `${historyItemId}-${bundleId}`;
      setExpandedBundles(prev => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold text-[var(--text-primary)]">Prompt History</h2>
                {history.length > 0 && 
                    <button onClick={onClearAll} className="btn-secondary btn flex items-center gap-2 text-sm text-red-400 border-red-500/50 hover:bg-red-500/10 hover:border-red-500/80">
                        <IconTrash className="w-4 h-4"/> Clear All
                    </button>
                }
            </div>

            {history.length > 0 && (
                <div className="history-controls">
                    <div className="history-search">
                        <IconSearch className="w-4 h-4 search-icon" />
                        <input 
                            type="text"
                            placeholder="Search history..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <div className="history-sort">
                        <select value={sortOrder} onChange={e => setSortOrder(e.target.value)}>
                            <option value="newest">Newest First</option>
                            <option value="oldest">Oldest First</option>
                            <option value="alpha">Prompt A-Z</option>
                        </select>
                    </div>
                </div>
            )}

            {history.length === 0 ? (
                <div className="history-empty-state">
                    <IconHistory className="w-16 h-16 text-[var(--border-secondary)]"/>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)]">Your History is Clear</h3>
                    <p>Generated prompts will appear here.</p>
                </div>
            ) : filteredAndSortedHistory.length === 0 ? (
                <div className="history-empty-state">
                    <IconSearch className="w-16 h-16 text-[var(--border-secondary)]"/>
                    <h3 className="text-xl font-semibold text-[var(--text-primary)]">No Matches Found</h3>
                    <p className="max-w-md">No history items match your search for "{searchTerm}". Try another keyword.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {filteredAndSortedHistory.map(item => {
                        const hydratedBundles = item.referencedBundles?.map(id => bundlesById.get(id)).filter((b): b is BundledTemplate => !!b) || [];
                        const hydratedTemplates = item.referencedTemplates?.map(id => templatesById.get(id)).filter((t): t is PromptTemplate => !!t) || [];
                        const isSavingThisItem = isSavingTemplate === item.id;

                        return (
                        <div key={item.id} className={`history-item-card ${expandedId === item.id ? 'expanded' : ''}`}>
                            <div className="history-item-header">
                                <button onClick={() => setExpandedId(expandedId === item.id ? null : item.id)} className="history-item-toggle">
                                    <div className={`history-mode-icon ${item.mode === 'JSON' ? 'json' : 'text'}`}>
                                        {item.mode === 'JSON' ? <IconCode className="w-5 h-5"/> : <IconText className="w-5 h-5"/>}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <p className="font-semibold text-[var(--text-primary)] truncate pr-4">{item.userPrompt}</p>
                                        <p className="text-sm text-[var(--text-muted)] mt-1">
                                            {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)] flex-shrink-0">
                                        <IconChevronDown className={`w-5 h-5 transition-transform ${expandedId === item.id ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>
                                <button onClick={() => onDeleteItem(item)} className="history-item-delete btn" aria-label="Delete history item">
                                    <IconTrash className="w-4 h-4"/>
                                </button>
                            </div>
                            {expandedId === item.id && (
                                <div className="history-details">
                                    {item.config && (
                                        <div className="history-detail-block">
                                            <h4 className="history-detail-title">Configuration</h4>
                                            <div className="history-config-pills-container">
                                                <div className="config-pill">
                                                    <IconSliders className="w-3 h-3 mr-1.5" />
                                                    <span>Style: <span className="font-semibold capitalize">{item.config.style}</span></span>
                                                </div>
                                                <div className={`config-pill ${item.config.useReasoning ? 'reasoning-on' : ''}`}>
                                                    <IconBrain className="w-3 h-3 mr-1.5" />
                                                    <span>Reasoning: <span className="font-semibold">{item.config.useReasoning ? 'On' : 'Off'}</span></span>
                                                </div>
                                                {item.config.useMarsLsp && (
                                                     <div className="config-pill mars-lsp-on">
                                                        <IconFilm className="w-3 h-3 mr-1.5" />
                                                        <span>MARS-LSP: <span className="font-semibold">On</span></span>
                                                    </div>
                                                )}
                                                {(item.config.isJsonMode || item.config.useMarsLsp) && item.config.length !== 'default' && (
                                                    <div className="config-pill">
                                                        <IconText className="w-3 h-3 mr-1.5" />
                                                        <span>Length: <span className="font-semibold capitalize">{item.config.length}</span></span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                    {(hydratedTemplates.length > 0) && (
                                        <div className="history-detail-block">
                                            <h4 className="history-detail-title">References Used</h4>
                                            <div className="history-ref-pills-container">
                                                {hydratedBundles.map(bundle => {
                                                  const key = `${item.id}-${bundle.id}`;
                                                  const isExpanded = expandedBundles[key];
                                                  const templatesInBundle = hydratedTemplates.filter(t => bundle.templateIds.includes(t.id));
                                                  return (
                                                    <React.Fragment key={bundle.id}>
                                                        <button onClick={() => toggleBundleExpansion(item.id, bundle.id)} className="ref-pill-bundle">
                                                            <IconPackage className="w-3 h-3 mr-1.5"/>
                                                            {bundle.name}
                                                            <IconChevronDown className={`w-4 h-4 ml-1.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        {isExpanded && (
                                                            <div className="history-bundle-expanded-templates">
                                                                {templatesInBundle.map(t => (
                                                                    <button key={t.id} onClick={() => onViewTemplate(t)} className="ref-pill">
                                                                        <IconBookOpen className="w-3 h-3 mr-1.5"/>
                                                                        {t.title}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                  )
                                                })}
                                                {hydratedTemplates.filter(t => !hydratedBundles.some(b => b.templateIds.includes(t.id))).map(t => (
                                                    <button key={t.id} onClick={() => onViewTemplate(t)} className="ref-pill">
                                                        <IconBookOpen className="w-3 h-3 mr-1.5"/>
                                                        {t.title}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div className="history-io-grid">
                                        <div className="history-input-block">
                                            <div className="history-io-header">
                                                <div className="flex items-center gap-2">
                                                    <IconBookOpen className="w-4 h-4 text-[var(--text-secondary)]"/>
                                                    <h4 className="history-io-title">Your Input</h4>
                                                </div>
                                                <button onClick={() => handleCopy(item.userPrompt)} className="btn copy-io-btn" aria-label="Copy user prompt">
                                                    <IconCopy className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="history-io-content">
                                                <p className="history-input-text">{item.userPrompt}</p>
                                            </div>
                                        </div>
                                        <div className="history-output-block">
                                            <div className="history-io-header">
                                                <div className="flex items-center gap-2">
                                                    <IconZap className="w-4 h-4 text-[var(--accent-primary)]"/>
                                                    <h4 className="history-io-title">Generated Prompt</h4>
                                                </div>
                                                <button onClick={() => handleCopy(item.generatedPrompt)} className="btn copy-io-btn" aria-label="Copy generated prompt">
                                                    <IconCopy className="w-4 h-4" />
                                                </button>
                                            </div>
                                            <div className="history-io-content">
                                                <pre className="history-output-text">{item.generatedPrompt}</pre>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="history-actions">
                                        <button onClick={() => onRerun(item)} className="btn-secondary btn history-action-btn">
                                            <IconRotateCw className="w-4 h-4"/>
                                            Re-run & Tweak
                                        </button>
                                        <button onClick={() => onSaveAsTemplate(item)} disabled={isSavingThisItem} className="btn-primary btn history-action-btn">
                                            {isSavingThisItem ? (
                                                <span className="btn-loading">
                                                    <div className="spinner"></div>
                                                    Saving...
                                                </span>
                                            ) : (
                                                <>
                                                  <IconSave className="w-4 h-4"/>
                                                  Save as Template
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )})}
                </div>
            )}
        </div>
    );
};

const BundleCard = React.memo(({ bundle, onOpenEditBundleModal, setBundles, setToast, animationDelay }: { 
  bundle: BundledTemplate;
  onOpenEditBundleModal: (bundle: BundledTemplate) => void;
  setBundles: React.Dispatch<React.SetStateAction<BundledTemplate[]>>;
  setToast: (toast: {message: string, type: 'success' | 'error'}) => void;
  animationDelay: string;
}) => (
  <div className="bundle-card" style={{ animationDelay }}>
      <div className="bundle-card-content">
          <div className="flex justify-between items-start">
              <IconPackage className="w-10 h-10 text-indigo-400" />
              <span className="tag-model">{bundle.templateIds.length} templates</span>
          </div>
          <div className="flex-grow">
            <h3 className="template-card-title mt-4">{bundle.name}</h3>
            <p className="template-card-description">{bundle.description}</p>
          </div>
          <div className="template-card-actions">
              <button onClick={() => onOpenEditBundleModal(bundle)} className="btn btn-secondary !py-2 text-sm flex-1 justify-center"><IconEdit className="w-4 h-4 mr-2"/> Edit</button>
              <button onClick={() => {
                  setBundles(prev => prev.filter(b => b.id !== bundle.id));
                  setToast({message: 'Bundle deleted.', type: 'success'});
              }} className="btn btn-secondary text-red-400 border-red-500/30 hover:bg-red-500/10 !w-auto px-3 !py-2">
                  <IconTrash className="w-4 h-4"/>
              </button>
          </div>
      </div>
  </div>
));

const TemplatesView = ({ 
  templates, setTemplates, 
  bundles, setBundles,
  setToast, 
  onOpenCreateModal, onOpenEditModal,
  onOpenCreateBundleModal, onOpenEditBundleModal,
  onOpenBatchAddModal,
  usageCounts,
}: { 
  templates: PromptTemplate[]; 
  setTemplates: React.Dispatch<React.SetStateAction<PromptTemplate[]>>;
  bundles: BundledTemplate[];
  setBundles: React.Dispatch<React.SetStateAction<BundledTemplate[]>>;
  setToast: (toast: {message: string, type: 'success' | 'error'}) => void;
  onOpenCreateModal: () => void;
  onOpenEditModal: (template: PromptTemplate) => void;
  onOpenCreateBundleModal: () => void;
  onOpenEditBundleModal: (bundle: BundledTemplate) => void;
  onOpenBatchAddModal: () => void;
  usageCounts: Map<string, number>;
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [currentTab, setCurrentTab] = useState('templates');

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        templates.forEach(t => t.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }, [templates]);

    const filteredTemplates = useMemo(() => {
        return templates.filter(t => {
            const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || t.description.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => t.tags.includes(tag));
            return matchesSearch && matchesTags;
        });
    }, [templates, searchTerm, selectedTags]);
    
    const filteredBundles = useMemo(() => {
        return bundles.filter(b => 
            b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
            b.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [bundles, searchTerm]);


    return (
        <div className="w-full max-w-7xl mx-auto px-4 py-8">
            <div className="library-header">
                <SlidingTabControl
                    options={[
                        { value: 'templates', label: <><IconLayoutTemplate className="w-4 h-4" /> Templates</> },
                        { value: 'bundles', label: <><IconPackage className="w-4 h-4" /> Bundles</> }
                    ]}
                    value={currentTab}
                    onChange={setCurrentTab}
                    className="library-main-tabs"
                />
                <div className="template-count-pill">{templates.length} TEMPLATES</div>
            </div>

            <div className="library-controls">
                <div className="history-search flex-grow min-w-[200px] max-w-sm">
                  <IconSearch className="w-4 h-4 search-icon" />
                  <input 
                    type="text" 
                    placeholder={`Search ${currentTab}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="!w-full"
                  />
                </div>
                
                <div className="flex items-center gap-2 sm:gap-4 flex-wrap justify-end">
                    {currentTab === 'templates' && (
                        <MultiTagFilterDropdown
                            allTags={allTags}
                            selectedTags={selectedTags}
                            onSelectionChange={setSelectedTags}
                            disabled={allTags.length === 0}
                        />
                    )}
                    
                    {currentTab === 'templates' ? (
                        <div className="action-button-group">
                            <button onClick={onOpenBatchAddModal} className="action-button-group-secondary" title="Batch Add">
                               <IconLayers className="w-4 h-4"/>
                               <span className="hidden sm:inline">Batch Add</span>
                            </button>
                            <button onClick={onOpenCreateModal} className="action-button-group-primary" title="Create New Template">
                                <IconPlus className="w-4 h-4"/>
                                <span className="hidden sm:inline">New Template</span>
                                <span className="sm:hidden">New</span>
                            </button>
                        </div>
                    ) : (
                        <button onClick={onOpenCreateBundleModal} className="btn btn-primary flex items-center gap-2 !rounded-full !px-5 !py-2.5 font-semibold">
                            <IconPlus className="w-4 h-4"/> Create Bundle
                        </button>
                    )}
                </div>
            </div>
            
            {currentTab === 'templates' && (
              <>
                {filteredTemplates.length === 0 ? (
                    <p className="text-center text-[var(--text-muted)] mt-12">No templates found. Try adjusting your filters or creating a new one!</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredTemplates.map(template => (
                            <TemplateCard 
                                key={template.id} 
                                template={template} 
                                setToast={setToast}
                                setTemplates={setTemplates}
                                onOpenEditModal={onOpenEditModal}
                                usageCount={usageCounts.get(template.id) || 0}
                            />
                        ))}
                    </div>
                )}
              </>
            )}

            {currentTab === 'bundles' && (
               <>
                {filteredBundles.length === 0 ? (
                    <p className="text-center text-[var(--text-muted)] mt-12">No bundles found. Create a bundle to group related templates!</p>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredBundles.map((bundle, index) => (
                           <BundleCard 
                                key={bundle.id} 
                                bundle={bundle}
                                onOpenEditBundleModal={onOpenEditBundleModal}
                                setBundles={setBundles}
                                setToast={setToast}
                                animationDelay={`${index * 0.07}s`}
                            />
                        ))}
                    </div>
                )}
               </>
            )}
        </div>
    );
};


const TemplateFormModal = ({ isOpen, onClose, onSave, existingTemplate }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (template: PromptTemplate) => void;
    existingTemplate: PromptTemplate | null;
}) => {
    const [template, setTemplate] = useState<Omit<PromptTemplate, 'id'>>({ title: '', description: '', prompt: '', tags: [], models: []});
    const [tagsInput, setTagsInput] = useState('');
    const [modelsInput, setModelsInput] = useState('');
    const [videoFile, setVideoFile] = useState<File | null>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            if (existingTemplate) {
                setTemplate(existingTemplate);
                setTagsInput(existingTemplate.tags.join(', '));
                setModelsInput(existingTemplate.models.join(', '));
            } else {
                setTemplate({ title: '', description: '', prompt: '', tags: [], models: [], exampleVideo: undefined, exampleVideoType: undefined });
                setTagsInput('');
                setModelsInput('');
                setVideoFile(null);
                if (videoInputRef.current) videoInputRef.current.value = '';
            }
        }
    }, [isOpen, existingTemplate]);

    const handleVideoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            setVideoFile(file);
            const { base64, type } = await fileToBase64(file);
            setTemplate(s => ({ ...s, exampleVideo: base64, exampleVideoType: type }));
        }
    };
    
    const handleSave = () => {
        if (!template.title || !template.prompt) return;
        const finalTemplate: PromptTemplate = {
            id: existingTemplate?.id || crypto.randomUUID(),
            ...template
        };
        onSave(finalTemplate);
        onClose();
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={existingTemplate ? "Edit Template" : "Create New Template"}>
          <div className="space-y-4">
               <input value={template.title} onChange={e => setTemplate(s=>({...s, title: e.target.value}))} placeholder="Template Title" className="setting-input"/>
               <textarea value={template.description} onChange={e => setTemplate(s=>({...s, description: e.target.value}))} placeholder="A short description" className="setting-input" rows={2}/>
               <textarea value={template.prompt} onChange={e => setTemplate(s=>({...s, prompt: e.target.value}))} placeholder="Template Prompt with {{placeholders}}" className="setting-input font-space-mono" rows={5}/>
               <input 
                   value={tagsInput} 
                   onChange={e => {
                       setTagsInput(e.target.value);
                       setTemplate(s=>({...s, tags: e.target.value.split(',').map(t=>t.trim()).filter(Boolean)}))
                   }} 
                   placeholder="Tags (comma-separated)" 
                   className="setting-input"
               />
               <input 
                   value={modelsInput} 
                   onChange={e => {
                       setModelsInput(e.target.value);
                       setTemplate(s=>({...s, models: e.target.value.split(',').map(t=>t.trim()).filter(Boolean)}))
                   }} 
                   placeholder="Models (e.g., Sora 2, Wan 2.2)" 
                   className="setting-input"
               />

               <div>
                    <input type="file" ref={videoInputRef} onChange={handleVideoChange} accept="video/*" className="hidden" />
                    {!template.exampleVideo && !videoFile ? (
                      <button onClick={() => videoInputRef.current?.click()} className="video-upload-area">
                        <IconUploadCloud className="w-8 h-8 text-[var(--text-muted)]"/>
                        <span className="font-semibold">Upload Video Preview</span>
                        <span className="text-xs text-[var(--text-muted)]">MP4, WebM, etc.</span>
                      </button>
                    ) : (
                      <div className="video-preview-wrapper">
                          <video 
                            src={videoFile ? URL.createObjectURL(videoFile) : `data:${template.exampleVideoType};base64,${template.exampleVideo}`} 
                            className="video-preview" 
                            autoPlay 
                            loop 
                            muted 
                            playsInline 
                          />
                           <div className="video-info-overlay">
                              <span className="truncate" title={videoFile?.name ?? 'Saved Video'}>{videoFile?.name ?? 'Saved Video'}</span>
                              {videoFile && <span className="flex-shrink-0 font-medium">{(videoFile.size / (1024 * 1024)).toFixed(2)} MB</span>}
                          </div>
                          <button onClick={() => {
                            setVideoFile(null);
                            setTemplate(s => ({...s, exampleVideo: undefined, exampleVideoType: undefined}));
                            if (videoInputRef.current) videoInputRef.current.value = '';
                          }} className="remove-media-btn btn !top-2 !right-2"><IconX className="w-4 h-4"/></button>
                      </div>
                    )}
               </div>

               <div className="modal-footer">
                  <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                  <button onClick={handleSave} className="btn-primary btn">Save Template</button>
               </div>
          </div>
      </Modal>
    );
};

const TemplateDetailModal = ({ template, isOpen, onClose }: { template: PromptTemplate | null, isOpen: boolean, onClose: () => void }) => {
    if (!template) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Template Details">
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-white">{template.title}</h3>
                <p className="text-sm text-gray-400">{template.description}</p>
                <div className="flex flex-wrap gap-2">
                    {template.models.map(m => <span key={m} className="tag-model">{m}</span>)}
                    {template.tags.map(t => <span key={t} className="tag-general">{t}</span>)}
                </div>
                <div>
                    <h4 className="font-semibold text-gray-300 mb-2 mt-4">Prompt</h4>
                    <pre className="prompt-display-block">{template.prompt}</pre>
                </div>
                <div className="modal-footer !p-0 !pt-4">
                    <button onClick={onClose} className="btn-secondary btn">Close</button>
                </div>
            </div>
        </Modal>
    )
};

const VisualBundleEditorModal = ({ isOpen, onClose, onSave, existingBundle, allTemplates }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (bundle: BundledTemplate) => void;
    existingBundle: BundledTemplate | null;
    allTemplates: PromptTemplate[];
}) => {
    const [bundleInfo, setBundleInfo] = useState({ name: '', description: '' });
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTags, setSelectedTags] = useState<string[]>([]);

    const allTags = useMemo(() => {
        const tags = new Set<string>();
        allTemplates.forEach(t => t.tags.forEach(tag => tags.add(tag)));
        return Array.from(tags).sort();
    }, [allTemplates]);

    useEffect(() => {
        if (isOpen) {
            if (existingBundle) {
                setBundleInfo({ name: existingBundle.name, description: existingBundle.description });
                setSelectedTemplateIds(new Set(existingBundle.templateIds));
            } else {
                setBundleInfo({ name: '', description: '' });
                setSelectedTemplateIds(new Set());
            }
            setSearchTerm('');
            setSelectedTags([]);
        }
    }, [isOpen, existingBundle]);

    const handleSave = () => {
        if (!bundleInfo.name) return;
        const finalBundle: BundledTemplate = {
            id: existingBundle?.id || crypto.randomUUID(),
            name: bundleInfo.name,
            description: bundleInfo.description,
            templateIds: Array.from(selectedTemplateIds)
        };
        onSave(finalBundle);
        onClose();
    };
    
    const toggleTemplateInBundle = (templateId: string) => {
        setSelectedTemplateIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(templateId)) {
                newSet.delete(templateId);
            } else {
                newSet.add(templateId);
            }
            return newSet;
        });
    };

    const filteredAvailableTemplates = useMemo(() => {
        return allTemplates.filter(t => {
            const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => t.tags.includes(tag));
            return matchesSearch && matchesTags;
        });
    }, [allTemplates, searchTerm, selectedTags]);
    
    const templatesInBundle = useMemo(() => {
        return Array.from(selectedTemplateIds)
            .map(id => allTemplates.find(t => t.id === id))
            .filter((t): t is PromptTemplate => !!t)
            .sort((a, b) => a.title.localeCompare(b.title));
    }, [selectedTemplateIds, allTemplates]);


    return (
        <Modal isOpen={isOpen} onClose={onClose} title={existingBundle ? "Edit Bundle" : "Create New Bundle"} className="modal-extra-wide visual-bundle-editor-modal">
            <div className="flex flex-col gap-4 h-full">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-shrink-0">
                   <input value={bundleInfo.name} onChange={e => setBundleInfo(s=>({...s, name: e.target.value}))} placeholder="Bundle Name" className="setting-input"/>
                   <input value={bundleInfo.description} onChange={e => setBundleInfo(s=>({...s, description: e.target.value}))} placeholder="A short description for the bundle" className="setting-input"/>
               </div>
               
               <div className="bundle-editor-content flex-col md:flex-row gap-4">
                  <div className="bundle-editor-sidebar h-[50vh] md:h-auto">
                      <div className="flex flex-col sm:flex-row gap-2 flex-shrink-0 mb-2">
                        <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="setting-input !py-1.5 flex-grow"/>
                         <MultiTagFilterDropdown
                            allTags={allTags}
                            selectedTags={selectedTags}
                            onSelectionChange={setSelectedTags}
                            disabled={allTags.length === 0}
                        />
                      </div>
                      <div className="bundle-editor-list">
                          {filteredAvailableTemplates.length > 0 ? filteredAvailableTemplates.map(template => {
                              const isSelected = selectedTemplateIds.has(template.id);
                              return (
                                <div
                                    key={template.id}
                                    role="checkbox"
                                    aria-checked={isSelected}
                                    tabIndex={0}
                                    className={`compact-template-item ${isSelected ? 'selected' : ''}`}
                                    onClick={() => toggleTemplateInBundle(template.id)}
                                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleTemplateInBundle(template.id); } }}
                                >
                                    <div className="selection-indicator">
                                        {isSelected && <IconCheck className="w-4 h-4 text-white" />}
                                    </div>
                                    <div className="flex-grow min-w-0">
                                        <h4 className="font-semibold text-[var(--text-primary)] truncate">{template.title}</h4>
                                        <p className="text-sm text-[var(--text-secondary)] description-truncate">{template.description}</p>
                                    </div>
                                </div>
                              )
                          }) : (
                            <div className="bundle-editor-dropzone-placeholder">
                                <p>No templates match your filters.</p>
                            </div>
                          )}
                      </div>
                  </div>
                  <div className="bundle-editor-selection-panel">
                      <h4 className="font-semibold text-gray-300 flex-shrink-0 mb-2">Templates in this Bundle ({selectedTemplateIds.size})</h4>
                      <div className="bundle-editor-selection-list">
                          {templatesInBundle.length === 0 ? (
                              <div className="bundle-editor-dropzone-placeholder">
                                  <IconPackage className="w-12 h-12"/>
                                  <p>Click templates on the left to add them here.</p>
                              </div>
                          ) : templatesInBundle.map(template => (
                              <div key={template.id} className="bundle-editor-selection-item">
                                   <div className="flex flex-col min-w-0">
                                      <p className="font-semibold truncate">{template.title}</p>
                                  </div>
                                  <button onClick={() => toggleTemplateInBundle(template.id)} className="btn !p-1.5 !rounded-full">
                                      <IconX className="w-4 h-4"/>
                                  </button>
                              </div>
                          ))}
                      </div>
                  </div>
               </div>

               <div className="modal-footer !mt-auto flex-shrink-0">
                  <span className="text-sm text-gray-500 mr-auto">{selectedTemplateIds.size} templates selected</span>
                  <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                  <button onClick={handleSave} className="btn-primary btn">Save Bundle</button>
               </div>
          </div>
      </Modal>
    );
};


const BatchAddTemplatesModal = ({ isOpen, onClose, onSave, existingTags, settings, showToast, isAistudio }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (templates: PromptTemplate[]) => void;
    existingTags: string[];
    settings: Settings;
    showToast: (toast: {message: string, type: 'success' | 'error'}) => void;
    isAistudio: boolean;
}) => {
    const [prompts, setPrompts] = useState([{ id: crypto.randomUUID(), value: '' }]);
    const [guidance, setGuidance] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            setPrompts([{ id: crypto.randomUUID(), value: '' }]);
            setGuidance('');
            setIsGenerating(false);
        }
    }, [isOpen]);

    const addPromptInput = () => {
        setPrompts(prev => [...prev, { id: crypto.randomUUID(), value: '' }]);
        setTimeout(() => {
            listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
        }, 100);
    };

    const removePromptInput = (id: string) => {
        setPrompts(prev => prev.length > 1 ? prev.filter(p => p.id !== id) : prev);
    };

    const updatePromptValue = (id: string, value: string) => {
        setPrompts(prev => prev.map(p => p.id === id ? { ...p, value } : p));
    };

    const handleGenerateAndSave = async () => {
        const nonEmptyPrompts = prompts.filter(p => p.value.trim() !== '').map(p => p.value);
        if (nonEmptyPrompts.length === 0) {
            showToast({ message: 'Please add at least one prompt.', type: 'error' });
            return;
        }

        setIsGenerating(true);
        let apiKeyToUse = '';
        if (isAistudio && settings.apiKeySource === 'environment') {
            apiKeyToUse = process.env.API_KEY || '';
        } else {
            apiKeyToUse = settings.apiKey;
        }

        if (!apiKeyToUse) {
            showToast({ message: 'API Key is missing. Please configure it in settings.', type: 'error' });
            setIsGenerating(false);
            return;
        }

        try {
            const metadataArray = await generateBatchTemplateMetadata({
                prompts: nonEmptyPrompts,
                guidance,
                existingTags,
                apiKey: apiKeyToUse,
            });

            const newTemplates = nonEmptyPrompts.map((prompt, index) => ({
                id: crypto.randomUUID(),
                prompt,
                title: metadataArray[index].title,
                description: metadataArray[index].description,
                tags: metadataArray[index].tags,
                models: ['Sora 2.2'], // Default model
            }));

            onSave(newTemplates);
            onClose();
        } catch (e: any) {
            showToast({ message: e.message || 'Failed to generate metadata.', type: 'error' });
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Batch Add Templates" className="modal-wide batch-add-modal">
            <div className="flex flex-col h-full gap-4">
                <textarea 
                    value={guidance}
                    onChange={e => setGuidance(e.target.value)}
                    placeholder="Optional: Provide context for all prompts (e.g., 'These are for cinematic anime scenes' or 'Focus on realistic camera movements')"
                    className="setting-input"
                    rows={2}
                    disabled={isGenerating}
                />

                <div className="batch-add-list flex-grow" ref={listRef}>
                    {prompts.map((p, index) => (
                        <div key={p.id} className="batch-prompt-item">
                            <span className="prompt-number">{index + 1}</span>
                            <textarea
                                value={p.value}
                                onChange={e => updatePromptValue(p.id, e.target.value)}
                                placeholder="Paste your full template prompt here..."
                                className="setting-input font-space-mono !rounded-lg"
                                rows={4}
                                disabled={isGenerating}
                            />
                            <button 
                                onClick={() => removePromptInput(p.id)} 
                                disabled={prompts.length <= 1 || isGenerating}
                                className="remove-prompt-btn btn"
                            >
                                <IconTrash className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>

                <button onClick={addPromptInput} disabled={isGenerating} className="btn-secondary btn w-full justify-center">
                    <IconPlus className="w-4 h-4 mr-2" />
                    Add Another Prompt
                </button>

                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                    <button onClick={handleGenerateAndSave} disabled={isGenerating} className="btn-primary btn">
                         {isGenerating ? (
                            <span className="btn-loading">
                                <div className="spinner"></div>
                                Generating & Saving...
                            </span>
                        ) : (
                            <>
                                <IconSave className="w-4 h-4 mr-2"/>
                                Generate & Save ({prompts.filter(p => p.value.trim()).length})
                            </>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
};


const ImportOptionsModal = ({ isOpen, onClose, onConfirm }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (options: Record<string, boolean>) => void;
}) => {
    const [options, setOptions] = useState({
        settings: false, // Disabled, so default to false
        history: true,
        templates: true,
        bundles: true,
    });

    const handleToggle = (key: keyof typeof options) => {
        if (key === 'settings') return;
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const Checkbox = ({ label, checked, onChange, disabled = false }: { label: string, checked: boolean, onChange: () => void, disabled?: boolean}) => (
        <label 
            onClick={disabled ? undefined : onChange}
            className={`flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg transition-colors ${
                disabled 
                ? 'cursor-not-allowed opacity-50' 
                : 'cursor-pointer hover:bg-gray-700/50'
            }`}
        >
            <div className={`w-5 h-5 rounded border-2 ${checked ? 'bg-indigo-500 border-indigo-400' : 'border-gray-500'} flex items-center justify-center`}>
                {checked && <IconCheck className="w-3 h-3 text-white"/>}
            </div>
            <span>{label}{disabled && <span className="text-xs ml-2 text-gray-500">(Disabled)</span>}</span>
        </label>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import Data">
            <div className="space-y-4">
                <p className="text-sm text-gray-400">Select which data you want to import from the file. Importing templates, bundles, or history will merge new items and not overwrite existing data. Settings will be overwritten.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Checkbox label="Settings" checked={options.settings} onChange={() => handleToggle('settings')} disabled={true} />
                    <Checkbox label="History" checked={options.history} onChange={() => handleToggle('history')} />
                    <Checkbox label="Templates" checked={options.templates} onChange={() => handleToggle('templates')} />
                    <Checkbox label="Bundles" checked={options.bundles} onChange={() => handleToggle('bundles')} />
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                    <button onClick={() => onConfirm(options)} className="btn-primary btn">Select File & Import</button>
                </div>
            </div>
        </Modal>
    );
}

const ExportOptionsModal = ({ isOpen, onClose, onConfirm }: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (options: Record<string, boolean>) => void;
}) => {
    const [options, setOptions] = useState({
        settings: true,
        history: true,
        templates: true,
        bundles: true,
    });

    const handleToggle = (key: keyof typeof options) => {
        setOptions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const Checkbox = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
        <label 
            onClick={onChange}
            className="flex items-center space-x-3 p-3 bg-gray-800/50 rounded-lg transition-colors cursor-pointer hover:bg-gray-700/50"
        >
            <div className={`w-5 h-5 rounded border-2 ${checked ? 'bg-indigo-500 border-indigo-400' : 'border-gray-500'} flex items-center justify-center`}>
                {checked && <IconCheck className="w-3 h-3 text-white"/>}
            </div>
            <span>{label}</span>
        </label>
    );

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Export Data">
            <div className="space-y-4">
                <p className="text-sm text-gray-400">Select which data you want to export to the file.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Checkbox label="Settings" checked={options.settings} onChange={() => handleToggle('settings')} />
                    <Checkbox label="History" checked={options.history} onChange={() => handleToggle('history')} />
                    <Checkbox label="Templates" checked={options.templates} onChange={() => handleToggle('templates')} />
                    <Checkbox label="Bundles" checked={options.bundles} onChange={() => handleToggle('bundles')} />
                </div>
                <div className="modal-footer">
                    <button onClick={onClose} className="btn-secondary btn">Cancel</button>
                    <button onClick={() => onConfirm(options)} className="btn-primary btn">Export Selected Data</button>
                </div>
            </div>
        </Modal>
    );
}


// --- APP ---

function App() {
  const isAistudio = useMemo(() => isAistudioEnvironment(), []);
  const [view, setView] = useState<View>(View.PROMPTER);
  const [settings, setSettings, isSettingsLoading] = useIndexedDB<Settings>('settings', { 
      theme: 'dark', 
      apiKeySource: isAistudio ? 'environment' : 'custom', 
      apiKey: '',
      hasSeenWelcome: false
  });
  const [history, setHistory] = useIndexedDB<HistoryItem[]>('history', []);
  const [templates, setTemplates] = useIndexedDB<PromptTemplate[]>('templates', []);
  const [bundles, setBundles] = useIndexedDB<BundledTemplate[]>('bundles', []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState(false);

  // Lifted Prompter State
  const [prompt, setPrompt] = useState('');
  const [isJsonMode, setIsJsonMode] = useState(false);
  const [useMarsLsp, setUseMarsLsp] = useState(false);
  const [media, setMedia] = useState<{ file: File, url: string, type: string } | null>(null);
  const [style, setStyle] = useState<'default' | 'anime' | 'realistic'>('default');
  const [length, setLength] = useState<'default' | 'short' | 'long'>('default');
  const [useReasoning, setUseReasoning] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<BundledTemplate[]>([]);
  const [selectedIndividualTemplates, setSelectedIndividualTemplates] = useState<PromptTemplate[]>([]);

  // State for Modals
  const [isTemplateFormModalOpen, setIsTemplateFormModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [isBundleEditorModalOpen, setIsBundleEditorModalOpen] = useState(false);
  const [editingBundle, setEditingBundle] = useState<BundledTemplate | null>(null);
  const [isBatchAddModalOpen, setIsBatchAddModalOpen] = useState(false);
  
  // State for History interactions
  const [viewingTemplate, setViewingTemplate] = useState<PromptTemplate | null>(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<HistoryItem | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState<string | null>(null);

  // State for Import/Export
  const [isImportOptionsModalOpen, setIsImportOptionsModalOpen] = useState(false);
  const [isExportOptionsModalOpen, setIsExportOptionsModalOpen] = useState(false);
  const [importOptions, setImportOptions] = useState<Record<string, boolean>>({});
  const importFileRef = useRef<HTMLInputElement>(null);
  
  const usageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    history.forEach(item => {
        item.referencedTemplates?.forEach(templateId => {
            counts.set(templateId, (counts.get(templateId) || 0) + 1);
        });
    });
    return counts;
  }, [history]);

  const tagUsageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    templates.forEach(template => {
        template.tags.forEach(tag => {
            counts.set(tag, (counts.get(tag) || 0) + 1);
        });
    });
    return counts;
  }, [templates]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    templates.forEach(t => t.tags.forEach(tag => tags.add(tag)));
    return Array.from(tags).sort();
  }, [templates]);

  useEffect(() => {
    if (!isSettingsLoading && !settings.hasSeenWelcome) {
        setIsWelcomeModalOpen(true);
    }
  }, [isSettingsLoading, settings.hasSeenWelcome]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
        const { clientX, clientY } = event;
        const target = event.target as HTMLElement;

        // Find the bounding box of the nearest relevant parent (the input wrapper)
        const box = target.closest('.input-wrapper');
        if (box) {
            const rect = box.getBoundingClientRect();
            document.documentElement.style.setProperty('--mouse-x', `${(clientX - rect.left) / rect.width * 100}%`);
            document.documentElement.style.setProperty('--mouse-y', `${(clientY - rect.top) / rect.height * 100}%`);
        } else {
             // Fallback for global effects
            const { innerWidth, innerHeight } = window;
            document.documentElement.style.setProperty('--mouse-x', `${(clientX / innerWidth) * 100}%`);
            document.documentElement.style.setProperty('--mouse-y', `${(clientY / innerHeight) * 100}%`);
        }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  const headerMaxWidthClass = useMemo(() => {
    switch (view) {
      case View.PROMPTER:
        return 'max-w-[800px]';
      case View.HISTORY:
        return 'max-w-4xl';
      case View.TEMPLATES:
        return 'max-w-7xl';
      default:
        return 'max-w-7xl';
    }
  }, [view]);

  const viewOrder = useMemo(() => [View.PROMPTER, View.HISTORY, View.TEMPLATES], []);
  const viewIndex = viewOrder.indexOf(view);

  const showToast = useCallback((toast: { message: string, type: 'success' | 'error' }) => {
    setToast(toast);
  }, []);
  
  const handleSaveTemplate = useCallback((templateData: PromptTemplate) => {
    if (editingTemplate) { // It's an update
        setTemplates(prev => prev.map(t => t.id === templateData.id ? templateData : t));
    } else { // It's a new template
        setTemplates(prev => [templateData, ...prev]);
    }
    showToast({message: `Template ${editingTemplate ? 'updated' : 'created'}!`, type: 'success'});
    setEditingTemplate(null);
  }, [editingTemplate, setTemplates, showToast]);

  const handleSaveBatchTemplates = useCallback((newTemplates: PromptTemplate[]) => {
      setTemplates(prev => [...newTemplates, ...prev]);
      showToast({ message: `${newTemplates.length} templates added successfully!`, type: 'success' });
  }, [setTemplates, showToast]);


  const handleOpenCreateModal = useCallback(() => {
    setEditingTemplate(null);
    setIsTemplateFormModalOpen(true);
  }, []);

  const handleOpenEditModal = useCallback((template: PromptTemplate) => {
    setEditingTemplate(template);
    setIsTemplateFormModalOpen(true);
  }, []);

  const handleSaveBundle = useCallback((bundleData: BundledTemplate) => {
    if (editingBundle) { // It's an update
        setBundles(prev => prev.map(b => b.id === bundleData.id ? bundleData : b));
    } else { // It's a new bundle
        setBundles(prev => [bundleData, ...prev]);
    }
    showToast({message: `Bundle ${editingBundle ? 'updated' : 'created'}!`, type: 'success'});
    setEditingBundle(null);
  }, [editingBundle, setBundles, showToast]);

  const handleOpenCreateBundleModal = useCallback(() => {
    setEditingBundle(null);
    setIsBundleEditorModalOpen(true);
  }, []);

  const handleOpenEditBundleModal = useCallback((bundle: BundledTemplate) => {
    setEditingBundle(bundle);
    setIsBundleEditorModalOpen(true);
  }, []);

  const handleClearHistory = () => {
    setConfirmModal({
        isOpen: true,
        title: 'Delete All History',
        message: 'Are you sure you want to permanently delete all items from your history? This action cannot be undone.',
        onConfirm: async () => {
            await clearStore('history');
            setHistory([]);
            showToast({ message: 'History cleared!', type: 'success' });
        }
    });
  };

  const handleDeleteItem = (itemToDelete: HistoryItem) => {
      setConfirmDeleteItem(itemToDelete);
  };
  
  const confirmDeleteItemAction = () => {
      if (!confirmDeleteItem) return;
      setHistory(prev => prev.filter(item => item.id !== confirmDeleteItem.id));
      showToast({ message: 'Item deleted from history.', type: 'success' });
      setConfirmDeleteItem(null);
  };
  
  const handleRerun = (item: HistoryItem) => {
    const userPrompt = item.userPrompt.replace(/\s\(media:.*\)/, '');
    setPrompt(userPrompt);

    if (item.config) {
        setIsJsonMode(item.config.isJsonMode);
        setUseMarsLsp(item.config.useMarsLsp);
        setStyle(item.config.style);
        setLength(item.config.length);
        setUseReasoning(item.config.useReasoning);
    }
    
    const rerunBundles = item.referencedBundles ? bundles.filter(b => item.referencedBundles?.includes(b.id)) : [];
    setSelectedBundles(rerunBundles);
    setSelectedTags([]); // Tags are not persisted in history, so reset them
    setSelectedIndividualTemplates([]); // Reset individual templates as well

    setMedia(null); // Media cannot be re-run
    setView(View.PROMPTER);
  };

  const handleSaveTemplateFromHistory = async (item: HistoryItem) => {
      setIsSavingTemplate(item.id);
      try {
          let apiKeyToUse = isAistudio && settings.apiKeySource === 'environment' ? process.env.API_KEY || '' : settings.apiKey;
          if (!apiKeyToUse) {
              showToast({ message: 'API key is missing.', type: 'error' });
              return;
          }

          const allExistingTags = Array.from(new Set(templates.flatMap(t => t.tags)));
          const metadata = (await generateTemplateMetadata({ prompt: item.generatedPrompt, existingTags: allExistingTags, apiKey: apiKeyToUse })) as { title: string; description: string; tags: string[] };

          const newTemplate: PromptTemplate = {
              id: crypto.randomUUID(),
              title: metadata.title,
              description: metadata.description,
              prompt: item.generatedPrompt,
              tags: metadata.tags,
              models: ['Sora 2.2'],
          };

          setTemplates(prev => [newTemplate, ...prev]);
          showToast({ message: 'Template saved successfully!', type: 'success' });
      } catch (error) {
          console.error("Failed to save template from history:", error);
          showToast({ message: 'Failed to generate template metadata.', type: 'error' });
      } finally {
          setIsSavingTemplate(null);
      }
  };


  const handleClearTemplates = () => {
     setConfirmModal({
        isOpen: true,
        title: 'Delete All Templates & Bundles',
        message: 'Are you sure you want to permanently delete all templates and bundles? This action cannot be undone.',
        onConfirm: async () => {
            await clearStore('templates');
            await clearStore('bundles');
            setTemplates([]);
            setBundles([]);
            showToast({ message: 'Templates and bundles cleared!', type: 'success' });
        }
    });
  };

  const handleExportData = async (options: Record<string, boolean>) => {
      try {
          const exportData: Record<string, any> = {};

          if (options.settings) {
              const settingsData = await db.getSingleObject('settings', 'user-settings');
              exportData.settings = settingsData || null;
          }
          if (options.history) {
              const historyData = await db.getStoreData('history');
              exportData.history = historyData;
          }
          if (options.templates) {
              const templatesData = await db.getStoreData('templates');
              exportData.templates = templatesData;
          }
          if (options.bundles) {
              const bundlesData = await db.getStoreData('bundles');
              exportData.bundles = bundlesData;
          }

          if (Object.keys(exportData).length === 0) {
              showToast({ message: 'Nothing selected to export.', type: 'error' });
              return;
          }

          const jsonString = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          const date = new Date().toISOString().split('T')[0];
          link.href = url;
          link.download = `prompt-architect-backup-${date}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showToast({ message: 'Data exported successfully!', type: 'success' });
      } catch (error) {
          console.error('Failed to export data:', error);
          showToast({ message: 'Failed to export data.', type: 'error' });
      }
  };

  const handleTriggerExport = (options: Record<string, boolean>) => {
    setIsExportOptionsModalOpen(false);
    handleExportData(options);
  };

  const handleTriggerImport = (options: Record<string, boolean>) => {
    setImportOptions(options);
    setIsImportOptionsModalOpen(false);
    importFileRef.current?.click();
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const text = e.target?.result;
              if (typeof text !== 'string') throw new Error('File is not valid text.');
              
              const importedData = JSON.parse(text);

              if (importOptions.settings && 'settings' in importedData && importedData.settings) {
                  await db.setSingleObject('settings', importedData.settings);
                  setSettings(importedData.settings.value);
              }

              if (importOptions.history && 'history' in importedData && Array.isArray(importedData.history)) {
                  setHistory(prev => {
                      const existingIds = new Set(prev.map(item => item.id));
                      const newItems = importedData.history.filter((item: HistoryItem) => !existingIds.has(item.id));
                      const combined = [...prev, ...newItems];
                      db.setStoreData('history', combined);
                      return combined;
                  });
              }

              if (importOptions.templates && 'templates' in importedData && Array.isArray(importedData.templates)) {
                  setTemplates(prev => {
                      const existingIds = new Set(prev.map(item => item.id));
                      const newItems = importedData.templates.filter((item: PromptTemplate) => !existingIds.has(item.id));
                      const combined = [...prev, ...newItems];
                      db.setStoreData('templates', combined);
                      return combined;
                  });
              }
              
              if (importOptions.bundles && 'bundles' in importedData && Array.isArray(importedData.bundles)) {
                  setBundles(prev => {
                      const existingIds = new Set(prev.map(item => item.id));
                      const newItems = importedData.bundles.filter((item: BundledTemplate) => !existingIds.has(item.id));
                      const combined = [...prev, ...newItems];
                      db.setStoreData('bundles', combined);
                      return combined;
                  });
              }

              showToast({ message: 'Data imported successfully!', type: 'success' });
          } catch (parseError) {
              console.error('Failed to parse or process import file:', parseError);
              showToast({ message: 'Failed to read or process the backup file.', type: 'error' });
          } finally {
              if (event.target) {
                  event.target.value = '';
              }
          }
      };
      reader.readAsText(file);
  };

  const handleCloseWelcomeModal = () => {
    setIsWelcomeModalOpen(false);
    setSettings(prev => ({...prev, hasSeenWelcome: true}));
  };

  const NavItem = ({ label, icon, currentView, targetView }: {label: string, icon: React.ReactNode, currentView: View, targetView: View}) => (
      <button onClick={() => setView(targetView)} className={`nav-item ${currentView === targetView ? 'active' : ''}`}>
          {icon}
          <span className="text-xs md:text-sm font-medium">{label}</span>
      </button>
  )

  return (
    <>
      <div className="bg-grid"></div>
      <div className="bg-orbs">
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
      </div>
      <div className="container">
        <header className={`header ${headerMaxWidthClass}`}>
            <div className="logo">
                <div className="logo-icon">
                    <div className="logo-core"></div>
                </div>
                <h1>Prompt Architect</h1>
            </div>
            <nav className="hidden md:flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-lg">
                <NavItem label="Prompter" icon={<IconZap className="w-4 h-4"/>} currentView={view} targetView={View.PROMPTER}/>
                <NavItem label="History" icon={<IconHistory className="w-4 h-4"/>} currentView={view} targetView={View.HISTORY}/>
                <NavItem label="Library" icon={<IconLayoutTemplate className="w-4 h-4"/>} currentView={view} targetView={View.TEMPLATES}/>
            </nav>
            <button onClick={() => setIsSettingsOpen(true)} className="settings-btn btn" aria-label="Open settings">
                <IconSettings className="w-5 h-5"/>
            </button>
        </header>
        
        <main>
          <div className="view-container" style={{ transform: `translateX(-${viewIndex * 100 / viewOrder.length}%)` }}>
              <div className="view-wrapper">
                  <PrompterView 
                      settings={settings} 
                      setHistory={setHistory} 
                      allTemplates={templates}
                      allBundles={bundles}
                      tagUsageCounts={tagUsageCounts}
                      isAistudio={isAistudio}
                      onViewTemplate={setViewingTemplate}
                      usageCounts={usageCounts}
                      prompt={prompt}
                      setPrompt={setPrompt}
                      isJsonMode={isJsonMode}
                      setIsJsonMode={setIsJsonMode}
                      useMarsLsp={useMarsLsp}
                      setUseMarsLsp={setUseMarsLsp}
                      media={media}
                      setMedia={setMedia}
                      style={style}
                      setStyle={setStyle}
                      length={length}
                      setLength={setLength}
                      useReasoning={useReasoning}
                      setUseReasoning={setUseReasoning}
                      selectedTags={selectedTags}
                      setSelectedTags={setSelectedTags}
                      selectedBundles={selectedBundles}
                      setSelectedBundles={setSelectedBundles}
                      selectedIndividualTemplates={selectedIndividualTemplates}
                      setSelectedIndividualTemplates={setSelectedIndividualTemplates}
                      setToast={showToast}
                  />
              </div>
              <div className="view-wrapper">
                  <HistoryView 
                      history={history} 
                      allTemplates={templates}
                      allBundles={bundles}
                      showToast={showToast} 
                      onDeleteItem={handleDeleteItem}
                      onViewTemplate={(t) => setViewingTemplate(t)}
                      onClearAll={handleClearHistory}
                      onRerun={handleRerun}
                      onSaveAsTemplate={handleSaveTemplateFromHistory}
                      isSavingTemplate={isSavingTemplate}
                  />
              </div>
              <div className="view-wrapper">
                  <TemplatesView 
                    templates={templates} 
                    setTemplates={setTemplates} 
                    bundles={bundles}
                    setBundles={setBundles}
                    setToast={showToast}
                    onOpenCreateModal={handleOpenCreateModal}
                    onOpenEditModal={handleOpenEditModal}
                    onOpenCreateBundleModal={handleOpenCreateBundleModal}
                    onOpenEditBundleModal={handleOpenEditBundleModal}
                    onOpenBatchAddModal={() => setIsBatchAddModalOpen(true)}
                    usageCounts={usageCounts}
                  />
              </div>
          </div>
        </main>
        
          <nav className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--bg-secondary)]/80 backdrop-blur-md border-t border-[var(--border-primary)] p-2 md:hidden">
              <div className="flex justify-around items-center">
                  <NavItem label="Prompter" icon={<IconZap className="w-5 h-5"/>} currentView={view} targetView={View.PROMPTER}/>
                  <NavItem label="History" icon={<IconHistory className="w-5 h-5"/>} currentView={view} targetView={View.HISTORY}/>
                  <NavItem label="Library" icon={<IconLayoutTemplate className="w-5 h-5"/>} currentView={view} targetView={View.TEMPLATES}/>
              </div>
          </nav>

        <SettingsModal 
          settings={settings} 
          setSettings={setSettings} 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          onClearHistory={handleClearHistory}
          onClearTemplates={handleClearTemplates}
          onExportData={() => {
              setIsSettingsOpen(false);
              setIsExportOptionsModalOpen(true);
          }}
          onImportData={() => {
              setIsSettingsOpen(false);
              setIsImportOptionsModalOpen(true);
          }}
          isAistudio={isAistudio}
        />
        <ConfirmationModal
          isOpen={confirmModal.isOpen}
          onClose={() => setConfirmModal(s => ({ ...s, isOpen: false }))}
          onConfirm={confirmModal.onConfirm}
          title={confirmModal.title}
        >
            {confirmModal.message}
        </ConfirmationModal>

        <ConfirmationModal
          isOpen={!!confirmDeleteItem}
          onClose={() => setConfirmDeleteItem(null)}
          onConfirm={confirmDeleteItemAction}
          title="Delete History Item"
        >
            Are you sure you want to permanently delete this item from your history?
        </ConfirmationModal>
        
        <TemplateFormModal
          isOpen={isTemplateFormModalOpen}
          onClose={() => setIsTemplateFormModalOpen(false)}
          onSave={handleSaveTemplate}
          existingTemplate={editingTemplate}
        />

        <VisualBundleEditorModal
          isOpen={isBundleEditorModalOpen}
          onClose={() => setIsBundleEditorModalOpen(false)}
          onSave={handleSaveBundle}
          existingBundle={editingBundle}
          allTemplates={templates}
        />

         <BatchAddTemplatesModal
            isOpen={isBatchAddModalOpen}
            onClose={() => setIsBatchAddModalOpen(false)}
            onSave={handleSaveBatchTemplates}
            existingTags={allTags}
            settings={settings}
            showToast={showToast}
            isAistudio={isAistudio}
        />

         <TemplateDetailModal 
            isOpen={!!viewingTemplate}
            onClose={() => setViewingTemplate(null)}
            template={viewingTemplate}
        />
        
        <ImportOptionsModal
          isOpen={isImportOptionsModalOpen}
          onClose={() => setIsImportOptionsModalOpen(false)}
          onConfirm={handleTriggerImport}
        />

        <ExportOptionsModal
          isOpen={isExportOptionsModalOpen}
          onClose={() => setIsExportOptionsModalOpen(false)}
          onConfirm={handleTriggerExport}
        />

        <WelcomeModal isOpen={isWelcomeModalOpen} onClose={handleCloseWelcomeModal} />

        <div className="toast-container">
          {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
        </div>

        <input
          type="file"
          ref={importFileRef}
          onChange={handleImportFileChange}
          accept="application/json,.json"
          className="hidden"
        />
      </div>
    </>
  );
}

export default App;
