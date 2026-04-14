const fs = require('fs');
let css = fs.readFileSync('public/css/main.css', 'utf8');

css += `

/* Popup Styles Restored */
.pin-popup-shell .maplibregl-popup-content {
  background: rgba(15, 15, 15, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-md);
  padding: 0;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  color: #fff;
  overflow: hidden;
}
.pin-popup-shell .maplibregl-popup-tip {
  border-top-color: rgba(15, 15, 15, 0.95);
  border-bottom-color: rgba(15, 15, 15, 0.95);
}

.pin-popup {
  display: flex;
  flex-direction: column;
  min-width: 220px;
}
.pin-popup--expanded {
  min-width: 280px;
}
.pin-popup__head {
  padding: 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.pin-popup__confidence {
  font-size: 0.8rem;
  color: #fb7185;
  font-weight: 700;
}
.pin-popup__title {
  font-size: 1.15rem;
  margin: 0;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.pin-popup__verified {
  color: #10b981;
  font-size: 1.1rem;
}
.pin-popup__image {
  width: 100%;
  height: 140px;
  object-fit: cover;
  display: none;
}
.pin-popup__image.is-expanded {
  display: block;
}
.pin-popup__meta {
  padding: 0.9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.pin-popup__meta p {
  margin: 0;
  font-size: 0.9rem;
  color: var(--muted);
  display: flex;
  justify-content: space-between;
}
.pin-popup__meta span {
  font-weight: 700;
  color: #fff;
}
.pin-popup__actions {
  display: flex;
  gap: 0.5rem;
  padding: 0 1rem 1rem 1rem;
}
.pin-popup__btn {
  flex: 1;
  padding: 0.55rem;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: center;
}
.pin-popup__btn--verify.is-verified {
  background: rgba(16, 185, 129, 0.15);
  border-color: rgba(16, 185, 129, 0.3);
  color: #10b981;
}
.pin-popup__btn--delete {
  background: rgba(239, 68, 68, 0.15);
  border-color: rgba(239, 68, 68, 0.3);
  color: #ef4444;
}
`;

fs.writeFileSync('public/css/main.css', css);
