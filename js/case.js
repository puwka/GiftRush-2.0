// case.js
import supabase from './supabase.js';

// Инициализация Telegram WebApp
const tg = window.Telegram.WebApp;

// Инициализация Supabase
const supabaseUrl = 'https://kggaengzxmautimlvcgh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtnZ2Flbmd6eG1hdXRpbWx2Y2doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NTgzOTEsImV4cCI6MjA2MzIzNDM5MX0.2NFe8_6OnvCjGVueJuVA1cO9zsjYTttID8UR90l9T9Q';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);

// Глобальные переменные
let currentUser = null;
let userBalance = 0;
let selectedCase = null;
let caseItems = [];
let isSpinning = false;
let spinTimeout = null;

// Инициализация страницы
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация Telegram WebApp
    tg.expand();
    
    // Получение данных пользователя из Telegram
    const tgUser = tg.initDataUnsafe?.user;
    
    if (tgUser) {
        // Проверка или создание пользователя в БД
        currentUser = await getUserOrCreate(tgUser);
        
        // Загрузка баланса
        loadUserBalance();
    }
    
    // Получение выбранного кейса
    const caseId = localStorage.getItem('selectedCaseId');
    if (caseId) {
        loadCaseData(caseId);
    } else {
        // Если кейс не выбран, возвращаем на главную
        window.location.href = 'index.html';
    }
    
    // Инициализация кнопок
    initButtons();
});

// Функция для получения пользователя
async function getUserOrCreate(tgUser) {
    const { data: existingUser, error } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', tgUser.id)
        .single();
    
    return existingUser;
}

// Функция для загрузки баланса пользователя
async function loadUserBalance() {
    if (!currentUser) return;
    
    const { data, error } = await supabase
        .from('users')
        .select('balance')
        .eq('id', currentUser.id)
        .single();
    
    if (data) {
        userBalance = data.balance;
    }
}

// Функция для загрузки данных кейса
async function loadCaseData(caseId) {
    // Загружаем информацию о кейсе
    const { data: caseData, error: caseError } = await supabase
        .from('cases')
        .select('*')
        .eq('id', caseId)
        .single();
    
    if (!caseData) {
        showNotification('Кейс не найден');
        window.location.href = 'index.html';
        return;
    }
    
    selectedCase = caseData;
    
    // Обновляем UI с информацией о кейсе
    document.getElementById('case-preview-image').src = caseData.image_url;
    document.getElementById('case-preview-name').textContent = caseData.name;
    document.getElementById('case-preview-price').textContent = `Стоимость: ${caseData.price} `;
    document.getElementById('open-case-btn').innerHTML = `Открыть за ${caseData.price} <i class="fas fa-coins"></i>`;
    
    // Загружаем предметы для этого кейса
    const { data: itemsData, error: itemsError } = await supabase
        .from('case_items')
        .select('item_id, items (*)')
        .eq('case_id', caseId);
    
    if (itemsData) {
        caseItems = itemsData.map(ci => ci.items);
        initRoulette();
    }
}

// Функция для инициализации рулетки
function initRoulette() {
    const rouletteContainer = document.getElementById('roulette-items');
    rouletteContainer.innerHTML = '';
    
    // Добавляем предметы в рулетку (повторяем для плавности)
    for (let i = 0; i < 3; i++) {
        caseItems.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'roulette-item';
            itemElement.innerHTML = `
                <img src="${item.image_url}" alt="${item.name}">
                <div class="item-name">${item.name}</div>
            `;
            rouletteContainer.appendChild(itemElement);
        });
    }
}

// Функция для инициализации кнопок
function initButtons() {
    // Кнопка открытия кейса
    document.getElementById('open-case-btn').addEventListener('click', () => {
        if (isSpinning) return;
        
        if (userBalance < selectedCase.price) {
            showNotification('Недостаточно средств');
            return;
        }
        
        openCase();
    });
    
    // Кнопка возврата на главную
    document.getElementById('back-to-main-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // Кнопка "В инвентарь" в результате
    document.getElementById('to-inventory-btn').addEventListener('click', () => {
        window.location.href = 'index.html#profile-tab';
    });
    
    // Кнопка "Открыть еще" в результате
    document.getElementById('open-another-btn').addEventListener('click', () => {
        document.getElementById('case-result').classList.remove('active');
        isSpinning = false;
    });
}

// Функция для открытия кейса
async function openCase() {
    if (!currentUser || !selectedCase || isSpinning) return;
    
    isSpinning = true;
    
    // Вычитаем стоимость кейса из баланса
    const newBalance = userBalance - selectedCase.price;
    
    // Обновляем баланс в БД
    const { error } = await supabase
        .from('users')
        .update({ balance: newBalance })
        .eq('id', currentUser.id);
    
    if (error) {
        console.error('Error updating balance:', error);
        showNotification('Ошибка при открытии кейса');
        isSpinning = false;
        return;
    }
    
    userBalance = newBalance;
    
    // Запускаем анимацию рулетки
    startRoulette();
}

// Функция для запуска рулетки
function startRoulette() {
    const roulette = document.getElementById('roulette-items');
    const itemWidth = 110; // Ширина одного предмета
    const spinDuration = 3000; // Длительность вращения в мс
    const slowDownDuration = 2000; // Длительность замедления
    
    // Выбираем случайный предмет для выигрыша (с учетом редкости)
    const wonItem = getRandomItemWithRarity();
    
    // Находим индекс выигранного предмета
    const wonIndex = caseItems.findIndex(item => item.id === wonItem.id);
    
    // Вычисляем позицию для остановки (центрируем выигранный предмет)
    const stopPosition = -(wonIndex * itemWidth + (itemWidth * caseItems.length * 2) + (itemWidth * 3));
    
    // Начальная позиция
    let startPosition = 0;
    roulette.style.transform = `translateX(${startPosition}px)`;
    
    // Анимация вращения
    let startTime = null;
    let spinInterval = null;
    
    function spin(timestamp) {
        if (!startTime) startTime = timestamp;
        const progress = timestamp - startTime;
        
        if (progress < spinDuration) {
            // Быстрое вращение
            const distance = -progress * 0.5; // Скорость вращения
            roulette.style.transform = `translateX(${distance}px)`;
            requestAnimationFrame(spin);
        } else if (progress < spinDuration + slowDownDuration) {
            // Замедление
            const timeLeft = spinDuration + slowDownDuration - progress;
            const slowFactor = timeLeft / slowDownDuration;
            const distance = stopPosition + (startPosition - stopPosition) * slowFactor;
            roulette.style.transform = `translateX(${distance}px)`;
            requestAnimationFrame(spin);
        } else {
            // Остановка
            roulette.style.transform = `translateX(${stopPosition}px)`;
            onRouletteStop(wonItem);
        }
    }
    
    requestAnimationFrame(spin);
}

// Функция для выбора случайного предмета с учетом редкости
function getRandomItemWithRarity() {
    // Создаем взвешенный массив на основе шансов выпадения
    let weightedItems = [];
    
    caseItems.forEach(item => {
        let weight = 1; // Базовый вес
        
        // Увеличиваем вес в зависимости от редкости кейса
        switch (selectedCase.rarity) {
            case 'common':
                weight = item.rarity === 'common' ? 10 : 
                         item.rarity === 'uncommon' ? 5 : 
                         item.rarity === 'rare' ? 2 : 1;
                break;
            case 'uncommon':
                weight = item.rarity === 'common' ? 5 : 
                         item.rarity === 'uncommon' ? 10 : 
                         item.rarity === 'rare' ? 5 : 2;
                break;
            case 'rare':
                weight = item.rarity === 'common' ? 2 : 
                         item.rarity === 'uncommon' ? 5 : 
                         item.rarity === 'rare' ? 10 : 5;
                break;
            case 'epic':
                weight = item.rarity === 'common' ? 1 : 
                         item.rarity === 'uncommon' ? 2 : 
                         item.rarity === 'rare' ? 5 : 10;
                break;
            case 'legendary':
                weight = item.rarity === 'common' ? 1 : 
                         item.rarity === 'uncommon' ? 1 : 
                         item.rarity === 'rare' ? 2 : 5;
                break;
        }
        
        // Добавляем предмет в массив weight раз
        for (let i = 0; i < weight; i++) {
            weightedItems.push(item);
        }
    });
    
    // Выбираем случайный предмет из взвешенного массива
    const randomIndex = Math.floor(Math.random() * weightedItems.length);
    return weightedItems[randomIndex];
}

// Функция, вызываемая после остановки рулетки
async function onRouletteStop(wonItem) {
    // Добавляем предмет в инвентарь пользователя
    const { error } = await supabase
        .from('inventory')
        .insert([{
            user_id: currentUser.id,
            item_id: wonItem.id,
            obtained_at: new Date().toISOString()
        }]);
    
    if (error) {
        console.error('Error adding item to inventory:', error);
        showNotification('Ошибка при получении предмета');
        return;
    }
    
    // Показываем результат
    showResult(wonItem);
}

// Функция для показа результата
function showResult(item) {
    const resultContainer = document.getElementById('case-result');
    const itemImage = document.getElementById('won-item-image');
    const itemName = document.getElementById('won-item-name');
    const itemRarity = document.getElementById('won-item-rarity');
    const itemPrice = document.getElementById('won-item-price');
    
    itemImage.src = item.image_url;
    itemName.textContent = item.name;
    itemRarity.innerHTML = `Редкость: <span>${getRarityName(item.rarity)}</span>`;
    itemPrice.innerHTML = `Цена: <span>${item.price}</span> <i class="fas fa-coins"></i>`;
    
    // Устанавливаем цвет редкости
    const raritySpan = itemRarity.querySelector('span');
    raritySpan.className = 'rarity-' + item.rarity;
    
    resultContainer.classList.add('active');
}

// Функция для получения названия редкости
function getRarityName(rarity) {
    const rarities = {
        'common': 'Обычный',
        'uncommon': 'Необычный',
        'rare': 'Редкий',
        'epic': 'Эпический',
        'legendary': 'Легендарный'
    };
    return rarities[rarity] || rarity;
}

// Функция для показа уведомлений
function showNotification(message) {
    if (tg.showAlert) {
        tg.showAlert(message);
    } else {
        alert(message);
    }
}