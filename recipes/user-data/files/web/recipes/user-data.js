// Home-screen card for the user-data recipe: add, list and delete notes.
export default {
  id: 'user-data',
  title: 'My notes',

  async mount(el, { call, errorText, tg }) {
    el.innerHTML = `
      <form class="stack" novalidate>
        <textarea rows="2" maxlength="500" placeholder="Write a note" aria-label="New note"></textarea>
        <button class="primary" type="submit">Save note</button>
      </form>
      <p class="error" hidden></p>
      <p class="muted empty" hidden>No notes yet.</p>
      <ul class="list"></ul>`;
    const form = el.querySelector('form');
    const input = el.querySelector('textarea');
    const save = el.querySelector('button[type=submit]');
    const error = el.querySelector('.error');
    const empty = el.querySelector('.empty');
    const list = el.querySelector('ul');

    const showError = (err) => { error.textContent = err ? errorText(err) : ''; error.hidden = !err; };

    const render = (notes) => {
      list.replaceChildren();
      empty.hidden = notes.length > 0;
      for (const note of notes) {
        const li = document.createElement('li');
        const text = document.createElement('span');
        text.textContent = note.text;
        const del = document.createElement('button');
        del.className = 'secondary small';
        del.type = 'button';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
          del.disabled = true;
          try {
            await call('deleteNote', { id: note.id });
            li.remove();
            empty.hidden = list.children.length > 0;
            showError(null);
          } catch (err) {
            del.disabled = false;
            showError(err);
          }
        });
        li.append(text, del);
        list.appendChild(li);
      }
    };

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        await call('addNote', { text: input.value });
        input.value = '';
        showError(null);
        render(await call('listNotes'));
        tg?.HapticFeedback?.notificationOccurred('success');
      } catch (err) {
        showError(err);
      } finally {
        save.disabled = false;
      }
    });

    render(await call('listNotes'));
  },
};
