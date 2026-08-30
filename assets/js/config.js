function spotifyStorageGet(key) {
  return safeStorageGet(key, null);
}

function spotifyStorageSet(key, value) {
  return safeStorageSet(key, value);
}

function spotifyStorageRemove(key) {
  return safeStorageRemove(key);
}

const DATA_URL = 'https://raw.githubusercontent.com/moxed42/dailygenre/main/genres_data.json';
const DATA_API_URL = 'https://api.github.com/repos/moxed42/dailygenre/contents/genres_data.json?ref=main';
const WORKER_URL = 'https://genre-spinner.sam-moxed.workers.dev/';

    const RANK_SEED = {
      'synth pop': {"rating":"4","rank_order":1},
      'glam rock': {"rating":"4","rank_order":2},
      'dance pop': {"rating":"4","rank_order":3},
      'hyperpop': {"rating":"4","rank_order":4},
      'pop metal': {"rating":"4","rank_order":5},
      'britpop': {"rating":"4","rank_order":6},
      'power pop': {"rating":"4","rank_order":7},
      'dark cabaret': {"rating":"4","rank_order":8},
      'emo rap': {"rating":"4","rank_order":9},
      'gabber': {"rating":"4","rank_order":10},
      'gothabilly': {"rating":"4","rank_order":11},
      'synth funk': {"rating":"4","rank_order":12},
      'outlaw country': {"rating":"4","rank_order":13},
      'americana': {"rating":"4","rank_order":14},
      'country folk': {"rating":"4","rank_order":15},
      'glam metal': {"rating":"4","rank_order":16},
      'funk': {"rating":"4","rank_order":17},
      'electro disco': {"rating":"4","rank_order":18},
      'sophisti-pop': {"rating":"4","rank_order":19},
      'street punk': {"rating":"4","rank_order":20},
      'post punk': {"rating":"4","rank_order":21},
      'jazz rap': {"rating":"4","rank_order":22},
      'pop rap': {"rating":"4","rank_order":23},

      'chamber pop': {"rating":"3","rank_order":1},
      'garage rock': {"rating":"3","rank_order":2},
      'symphonic metal': {"rating":"3","rank_order":3},
      'celtic folk': {"rating":"3","rank_order":4},
      'light music': {"rating":"3","rank_order":5},
      'british hip hop': {"rating":"3","rank_order":6},
      'city pop': {"rating":"3","rank_order":7},
      'heartland rock': {"rating":"3","rank_order":8},
      'traditional bluegrass': {"rating":"3","rank_order":9},
      'nintendo core': {"rating":"3","rank_order":10},
      'symphonic death metal': {"rating":"3","rank_order":11},
      'latino punk': {"rating":"3","rank_order":12},
      'melodic house': {"rating":"3","rank_order":13},
      'dansband': {"rating":"3","rank_order":14},
      'west coast jazz': {"rating":"3","rank_order":15},
      'third stream': {"rating":"3","rank_order":16},
      'grunge': {"rating":"3","rank_order":17},
      'brostep': {"rating":"3","rank_order":18},
      'horrorcore': {"rating":"3","rank_order":19},
      'west coast hip hop': {"rating":"3","rank_order":20},
      'electro hip hop': {"rating":"3","rank_order":21},
      'trouse': {"rating":"3","rank_order":22},
      'latin pop': {"rating":"3","rank_order":23},
      'trop rock': {"rating":"3","rank_order":24},
      'surf rock': {"rating":"3","rank_order":25},
      'lubbock sound': {"rating":"3","rank_order":26},
      'shibuya kei': {"rating":"3","rank_order":27},
      'chinese rock': {"rating":"3","rank_order":28},
      'quiet storm': {"rating":"3","rank_order":29},
      'detroit blues': {"rating":"3","rank_order":30},
      'synth punk': {"rating":"3","rank_order":31},
      'punk blues': {"rating":"3","rank_order":32},
      'yacht rock': {"rating":"3","rank_order":33},
      'ambient techno': {"rating":"3","rank_order":34},
      'talking blues': {"rating":"3","rank_order":35},
      'chicago blues': {"rating":"3","rank_order":36},
      'neue deutsche welle ndw': {"rating":"3","rank_order":37},
      'bloghaus': {"rating":"3","rank_order":38},
      'trip hop': {"rating":"3","rank_order":39},
      'acid rock': {"rating":"3","rank_order":40},
      'countrypolitan': {"rating":"3","rank_order":41},
      'crossover thrash': {"rating":"3","rank_order":42},
      'dark electro': {"rating":"3","rank_order":43},
      'speedcore': {"rating":"3","rank_order":44},
      'bebop': {"rating":"3","rank_order":45},
      'cpop': {"rating":"3","rank_order":46},
      'celtic rock': {"rating":"3","rank_order":47},
      'hipster hop': {"rating":"3","rank_order":48},
      'memphis rap': {"rating":"3","rank_order":49},
      'psychedelic break beat': {"rating":"3","rank_order":50},
      'jungle': {"rating":"3","rank_order":51},
      'brazilian rock': {"rating":"3","rank_order":52},
      'electro swing': {"rating":"3","rank_order":53},
      'indian pop': {"rating":"3","rank_order":54},
      'avant garde jazz': {"rating":"3","rank_order":55},
      'samba': {"rating":"3","rank_order":56},
      'punk jazz': {"rating":"3","rank_order":57},
      'beatdown hardcore': {"rating":"3","rank_order":58},
      'post prog': {"rating":"3","rank_order":59},
      'soul blues': {"rating":"3","rank_order":60},
      'psychedelic music': {"rating":"3","rank_order":61},
      'tropical house': {"rating":"3","rank_order":62},
      'crunkcore': {"rating":"3","rank_order":63},
      'sambass': {"rating":"3","rank_order":64},
      'mexican pop': {"rating":"3","rank_order":65},
      'boogie woogie': {"rating":"3","rank_order":66},
      'cosmic disco': {"rating":"3","rank_order":67},
      'hardbag': {"rating":"3","rank_order":68},
      'new mexico music': {"rating":"3","rank_order":69},
      'uk bass': {"rating":"3","rank_order":70},
      'rap core': {"rating":"3","rank_order":71},
      'garage house': {"rating":"3","rank_order":72},
      'punk pathetique': {"rating":"3","rank_order":73},
      'future garage': {"rating":"3","rank_order":74},

      'funeral doom': {"rating":"2","rank_order":1},
      'jackin house': {"rating":"2","rank_order":2},
      'melbourne bounce': {"rating":"2","rank_order":3},
      'jungletekk': {"rating":"2","rank_order":4},
      'atmospheric black metal': {"rating":"2","rank_order":5},
      'new wave classic rock': {"rating":"2","rank_order":6},
      'latin ballad': {"rating":"2","rank_order":7},
      'afro rock': {"rating":"2","rank_order":8},
      'afro house': {"rating":"2","rank_order":9},
      'power electronic': {"rating":"2","rank_order":10},
      'neoclassical metal': {"rating":"2","rank_order":11},
      'kansas city blues': {"rating":"2","rank_order":12},
      'avant garde black metal': {"rating":"2","rank_order":13},
      'iranian pop': {"rating":"2","rank_order":14},
      'rawstyle': {"rating":"2","rank_order":15},
      'booty music': {"rating":"2","rank_order":16},
      'country rap': {"rating":"2","rank_order":17},
      'turkish rock': {"rating":"2","rank_order":18},
      'manila sound': {"rating":"2","rank_order":19},
      'rage': {"rating":"2","rank_order":20},
      'crunk': {"rating":"2","rank_order":21},
      'death n roll': {"rating":"2","rank_order":22},
      'hardstyle': {"rating":"2","rank_order":23},
      'truck driving country': {"rating":"2","rank_order":24},
      'phonk': {"rating":"2","rank_order":25},
      'sludge': {"rating":"2","rank_order":26},
      'snap music': {"rating":"2","rank_order":27},
      'jerk': {"rating":"2","rank_order":28},
      'frenchcore': {"rating":"2","rank_order":29},
      'unblack metal': {"rating":"2","rank_order":30},
      'viking rock': {"rating":"2","rank_order":31},

      'noise music': {"rating":"1","rank_order":1},
      'blackened doom metal': {"rating":"1","rank_order":2},
      'intelligent drum and bass': {"rating":"1","rank_order":3},
      'dubstyle': {"rating":"1","rank_order":4},
      'drill': {"rating":"1","rank_order":5},
      'splittercore': {"rating":"1","rank_order":6},
      'footwork': {"rating":"1","rank_order":7},
      'deathgrind': {"rating":"1","rank_order":8}
    };

    let genres = [];
    let songInbox = []; // in-memory unassigned song inbox
    let currentGenre = null;
    let selectedRating = '';
    let appPassword = '';
    let archiveUiState = null;
    let detailNavList = [];
    let pendingSaveAction = null;
    let unmatchedSeeds = [];
    let monthlySortAsc = true;
    let archiveView = 'all';
    let archiveCurrentItems = [];
    let archiveCurrentLabel = 'All';
    let detailEditMode = false;
    let serverFileSha = '';
    let libraryUpdatesPending = false;
    const stagedQueueReactionKeys = new Set();
    let metadataQueueFilter = 'spotify';
    let spotifyRefreshRunning = false;
    let spotifyRefreshCancelRequested = false;
    let spotifyRefreshReport = null;
    const PENDING_SONG_NOTES_STORAGE_KEY = 'dailyGenre.pendingSongNotes.v1';
    const SPOTIFY_COOLDOWN_STORAGE_KEY = 'dailygenre.spotifyCooldownUntil';
    let spotifyRefreshPausedUntil = Number(spotifyStorageGet(SPOTIFY_COOLDOWN_STORAGE_KEY) || 0);
    let spotifyRefreshCountdownTimer = null;
    const spotifyMetadataFailures = new Map();
    let vizFocusedGenreId = '';
    let vizOpenQueue = '';
    let vizQueueLimits = { unrated: 8, metadata: 8, maintenance: 40, reviewPending: 160 };
    let vizDrilldownState = null;
    const DEFAULT_PAGE_TITLE = 'Daily Genre';

    const spinnerTrack = document.getElementById('spinnerTrack');
    const remainingCount = document.getElementById('remainingCount');
    const spinBtn = document.getElementById('spinBtn');
    const spinResult = document.getElementById('spinResult');
    const manualPanel = document.getElementById('manualPanel');
    const manualToggleBtn = document.getElementById('manualToggleBtn');

    const passwordModal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const passwordSubmitBtn = document.getElementById('passwordSubmitBtn');
    const passwordCancelBtn = document.getElementById('passwordCancelBtn');
    const passwordNotice = document.getElementById('passwordNotice');
