import '@electronic-artefacts/spatial-viewer';
const viewer = document.querySelector('#viewer');
const detail = document.querySelector('#detail');
const list = document.querySelector('#region-list');
const show = (region) => {
  detail.textContent = `${region.label} — ${region.tags.join(', ') || 'untagged'} (${region.id})`;
  for (const button of list.querySelectorAll('button'))
    button.setAttribute('aria-selected', String(button.dataset.id === region.id));
};
viewer.addEventListener('region-enter', (event) => show(event.detail));
viewer.addEventListener('region-select', (event) => show(event.detail));
viewer.addEventListener('spatial-error', (event) => {
  detail.textContent = `Spatial Viewer error: ${event.detail?.message ?? 'Unable to load this artefact.'}`;
});
fetch(`${import.meta.env.BASE_URL}artifact/artifact.json`)
  .then((response) => response.json())
  .then((artifact) => {
    for (const region of artifact.regions) {
      const button = document.createElement('button');
      button.dataset.id = region.id;
      button.textContent = `${region.label}: ${region.tags.join(', ')}`;
      button.addEventListener('click', () => show(region));
      const item = document.createElement('li');
      item.append(button);
      list.append(item);
    }
  });
