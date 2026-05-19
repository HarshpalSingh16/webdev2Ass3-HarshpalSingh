
// DIFFICULTY CONFIG 
const DIFFICULTY = {
  easy:   { pairs: 3,  time: 60,  cols: 3, cardSize: 130 },
  medium: { pairs: 6,  time: 90,  cols: 4, cardSize: 115 },
  hard:   { pairs: 10, time: 120, cols: 5, cardSize: 100 }
};

// GAME STATE 
let state = {
  difficulty: 'easy',
  theme: 'dark',
  running: false,
  firstCard: null,
  secondCard: null,
  lockBoard: false,
  clicks: 0,
  matched: 0,
  totalPairs: 0,
  timeLeft: 0,
  timerInterval: null,
  powerupsLeft: 3,
  cards: []   // array of card DOM elements
};

// INIT 
$(document).ready(function () {
  bindControls();
  updateDiffInfo();
  updatePowerupBtn();
});

// BIND UI CONTROLS 
function bindControls() {
  // Difficulty buttons
  $('.diff-btn').on('click', function () {
    $('.diff-btn').removeClass('active');
    $(this).addClass('active');
    state.difficulty = $(this).data('diff');
    updateDiffInfo();
  });

  // Theme buttons
  $('.theme-btn').on('click', function () {
    $('.theme-btn').removeClass('active');
    $(this).addClass('active');
    state.theme = $(this).data('theme');
    $('html').attr('data-theme', state.theme);
  });

  // Start button
  $('#start_btn').on('click', startGame);

  // Reset button
  $('#reset_btn').on('click', resetGame);

  // Power-up button
  $('#powerup_btn').on('click', triggerPowerup);

  // Overlay play again
  $('#overlay_play_again').on('click', startGame);
}

// DIFFICULTY INFO 
function updateDiffInfo() {
  $('.diff-card').removeClass('active');
  $(`#diff_${state.difficulty}`).addClass('active');

  const cfg = DIFFICULTY[state.difficulty];
  $('#stat_total').text(cfg.pairs);
  $('#stat_pairs_left').text(cfg.pairs);
  $('#stat_timer').text(formatTime(cfg.time));
}

// START GAME 
async function startGame() {
  resetState();
  hideOverlay();
  showLoading(true);
  hideSplash();

  const cfg = DIFFICULTY[state.difficulty];
  state.totalPairs = cfg.pairs;
  state.timeLeft = cfg.time;

  updateStats();

  try {
    const pokemon = await fetchRandomPokemon(cfg.pairs);
    buildGrid(pokemon, cfg);
    showLoading(false);
    state.running = true;
    startTimer();
    state.powerupsLeft = 3;
    updatePowerupBtn();
  } catch (err) {
    showLoading(false);
    showOverlay('❌', 'API Error', 'Could not load Pokémon. Check your connection.');
    console.error(err);
  }
}

// RESET STATE 
function resetState() {
  clearInterval(state.timerInterval);
  state.running = false;
  state.firstCard = null;
  state.secondCard = null;
  state.lockBoard = false;
  state.clicks = 0;
  state.matched = 0;
  state.totalPairs = 0;
}

// RESET GAME 
function resetGame() {
  if (!state.running && $('#game_grid').children().length === 0) return;
  startGame();
}

// FETCH POKÉMON 
async function fetchRandomPokemon(count) {
  // Get full list (limit to first 1025 which all have official artwork)
  const listRes = await fetch('https://pokeapi.co/api/v2/pokemon?limit=1025');
  if (!listRes.ok) throw new Error('Failed to fetch Pokémon list');
  const listData = await listRes.json();

  // Shuffle and pick 'count' unique Pokémon
  const shuffled = shuffleArray([...listData.results]);
  const selected = shuffled.slice(0, count);

  // Fetch details for each to get image URLs
  const details = await Promise.all(
    selected.map(p => fetch(p.url).then(r => r.json()))
  );

  return details.map(p => ({
    name: p.name,
    id: p.id,
    img: p.sprites.other['official-artwork'].front_default ||
         p.sprites.front_default ||
         `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${p.id}.png`
  }));
}

// BUILD GRID 
function buildGrid(pokemon, cfg) {
  const $grid = $('#game_grid');
  $grid.empty();

  // Duplicate each Pokémon for pairs
  const pairs = [...pokemon, ...pokemon];
  const shuffled = shuffleArray(pairs);

  state.cards = [];

  shuffled.forEach((poke, idx) => {
    const cardId = `card_${idx}`;
    const $card = $(`
      <div class="card" id="${cardId}" data-src="${poke.img}" data-name="${poke.name}" style="width:${cfg.cardSize}px; height:${cfg.cardSize}px;">
        <div class="back_face">
          <img src="back.webp" alt="Card back">
        </div>
        <div class="front_face">
          <img src="${poke.img}" alt="${poke.name}">
        </div>
      </div>
    `);

    $card.on('click', onCardClick);
    $grid.append($card);
    state.cards.push($card);
  });
}

// CARD CLICK HANDLER 
function onCardClick() {
  const $card = $(this);

  // Guard conditions
  if (!state.running) return;
  if (state.lockBoard) return;
  if ($card.hasClass('flipped')) return;
  if ($card.hasClass('matched')) return;

  // Flip the card
  $card.addClass('flipped');
  state.clicks++;
  updateStats();

  if (!state.firstCard) {
    state.firstCard = $card;
    return;
  }

  state.secondCard = $card;
  state.lockBoard = true;

  checkMatch();
}

// CHECK MATCH 
function checkMatch() {
  const src1 = state.firstCard.data('src');
  const src2 = state.secondCard.data('src');

  if (src1 === src2) {
    // Match!
    state.firstCard.addClass('matched');
    state.secondCard.addClass('matched');
    state.matched++;
    updateStats();
    resetTurn();

    if (state.matched === state.totalPairs) {
      endGame(true);
    }
  } else {
    // No match — flip back after delay
    const $first = state.firstCard;
    const $second = state.secondCard;
    setTimeout(() => {
      $first.removeClass('flipped');
      $second.removeClass('flipped');
      resetTurn();
    }, 1000);
  }
}

// RESET TURN 
function resetTurn() {
  state.firstCard = null;
  state.secondCard = null;
  state.lockBoard = false;
}

// TIMER 
function startTimer() {
  clearInterval(state.timerInterval);
  updateTimerDisplay();

  state.timerInterval = setInterval(() => {
    if (!state.running) { clearInterval(state.timerInterval); return; }
    state.timeLeft--;
    updateTimerDisplay();

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      endGame(false);
    }
  }, 1000);
}

function updateTimerDisplay() {
  const $timerItem = $('.timer-item');
  $('#stat_timer').text(formatTime(state.timeLeft));
  if (state.timeLeft <= 10 && state.timeLeft > 0) {
    $timerItem.addClass('urgent');
  } else {
    $timerItem.removeClass('urgent');
  }
}

function formatTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// UPDATE STATS
function updateStats() {
  const cfg = DIFFICULTY[state.difficulty];
  const pairsLeft = state.totalPairs - state.matched;

  $('#stat_clicks').text(state.clicks);
  $('#stat_pairs_left').text(state.totalPairs > 0 ? pairsLeft : '—');
  $('#stat_matched').text(state.matched);
  $('#stat_total').text(state.totalPairs > 0 ? state.totalPairs : '—');
}

// END GAME 
function endGame(won) {
  clearInterval(state.timerInterval);
  state.running = false;
  state.lockBoard = true;

  // Prevent any remaining unmatched cards from being clicked
  $('.card').off('click');

  if (won) {
    const timeTaken = DIFFICULTY[state.difficulty].time - state.timeLeft;
    showOverlay(
      '🏆',
      'You Win!',
      `Matched all ${state.totalPairs} pairs in ${formatTime(timeTaken)} with ${state.clicks} clicks!`
    );
  } else {
    const unmatched = state.totalPairs - state.matched;
    showOverlay(
      '💀',
      'Game Over!',
      `Time\'s up! ${unmatched} pair${unmatched !== 1 ? 's' : ''} remaining. Better luck next time!`
    );
  }
}

// OVERLAY HELPERS 
function showOverlay(icon, title, sub) {
  $('#overlay_icon').text(icon);
  $('#overlay_title').text(title);
  $('#overlay_sub').text(sub);
  $('#overlay').removeClass('hidden');
}

function hideOverlay() {
  $('#overlay').addClass('hidden');
}

// LOADING HELPERS
function showLoading(show) {
  if (show) {
    $('#loading').removeClass('hidden');
    $('#game_grid').empty();
  } else {
    $('#loading').addClass('hidden');
  }
}

function hideSplash() {
  $('#splash').addClass('hidden');
}

// POWERUP — PEEK 
function triggerPowerup() {
  if (state.powerupsLeft <= 0) return;
  if (!state.running) return;
  if (state.lockBoard) return;

  state.powerupsLeft--;
  updatePowerupBtn();

  // Flip all unmatched cards face-up briefly
  const $unmatched = $('.card:not(.matched)');
  state.lockBoard = true;

  $unmatched.each(function () {
    $(this).addClass('peeked');
  });

  setTimeout(() => {
    $unmatched.each(function () {
      $(this).removeClass('peeked');
      // Don't un-flip already-flipped cards (firstCard / secondCard)
    });
    // Re-apply flipped to firstCard if mid-turn
    if (state.firstCard) state.firstCard.addClass('flipped');
    state.lockBoard = false;
  }, 2000);
}

function updatePowerupBtn() {
  const $btn = $('#powerup_btn');
  $btn.find('#powerup_count').text(`×${state.powerupsLeft}`);
  if (state.powerupsLeft <= 0) {
    $btn.prop('disabled', true);
  } else {
    $btn.prop('disabled', false);
  }
}

// SHUFFLE 
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
