// The level-up screen: three upgrade cards. Click one, or press 1 / 2 / 3.
const screen = document.getElementById('levelup');
const cards = document.getElementById('levelup-cards');
const title = document.getElementById('levelup-title');
let choices = [], onPick = null;

function pick(i) {
  if (!onPick || !choices[i]) return;
  const done = onPick, choice = choices[i];
  onPick = null;
  screen.classList.add('hidden');
  done(choice);
}

window.addEventListener('keydown', (e) => {
  const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
  if (i >= 0 && onPick) {
    e.preventDefault();   // tells main.js this key press was used up here (so it doesn't also switch guns)
    pick(i);
  }
});

export const levelUp = {
  get open() { return onPick !== null; },

  // stacks(upgrade) -> how many of it the player already has.
  // describe(upgrade, owned) -> what taking it now would do.
  show(heading, upgrades, stacks, describe, callback) {
    choices = upgrades;
    onPick = callback;
    title.textContent = heading;
    cards.replaceChildren(...upgrades.map((u, i) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `card ${u.rarity}`;
      const owned = stacks(u);
      card.innerHTML = `<span class="key">${i + 1}</span><span class="name"></span><span class="desc"></span><span class="owned"></span>`;
      card.querySelector('.name').textContent = u.name;
      card.querySelector('.desc').textContent = describe(u, owned);
      card.querySelector('.owned').textContent = u.max > 20 ? '' : owned ? `Level ${owned} to ${owned + 1}  (max ${u.max})` : u.rarity === 'rare' ? 'Rare' : '';
      card.addEventListener('click', () => pick(i));
      return card;
    }));
    screen.classList.remove('hidden');
  },

  hide() {
    onPick = null;
    screen.classList.add('hidden');
  },
};
