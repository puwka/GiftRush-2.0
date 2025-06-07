import supabase from './supabase.js';

// Глобальные переменные
let currentUser = null;
let userBalance = 0;
let caseData = null; // Теперь можно перезаписывать
let caseItems = [];
let selectedCount = 1;
let wonItems = [];

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    // Инициализация Telegram WebApp
    const tg = window.Telegram.WebApp;
    tg.expand();
    
    // Получение данных пользователя из Telegram
    const tgUser = tg.initDataUnsafe?.user;
    
    if (tgUser) {
        // Проверка или создание пользователя в БД
        currentUser = await getUser(tgUser);
        
        if (!currentUser) {
            showNotification('Ошибка загрузки профиля');
            return;
        }
        
        // Обновление UI с данными пользователя
        updateUserUI(currentUser);
        
        // Загрузка баланса
        await loadUserBalance();
    }
    
    // Загрузка данных кейса
    await loadCaseData();
    
    // Инициализация UI
    initUI();
    
    // Инициализация обработчиков событий
    initEventListeners();
});



// Функция для получения пользователя
async function getUser(tgUser) {
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('telegram_id', tgUser.id)
            .single();
        
        if (error) throw error;
        return user;
    } catch (error) {
        console.error('Error getting user:', error);
        return null;
    }
}

// Функция для обновления UI с данными пользователя
function updateUserUI(user) {
    document.getElementById('user-balance').textContent = user.balance;
    userBalance = user.balance;
}

// Функция для загрузки баланса пользователя
async function loadUserBalance() {
    if (!currentUser) return;
    
    try {
        const { data, error } = await supabase
            .from('users')
            .select('balance')
            .eq('id', currentUser.id)
            .single();
        
        if (error) throw error;
        
        if (data) {
            userBalance = data.balance;
            document.getElementById('user-balance').textContent = userBalance;
        }
    } catch (error) {
        console.error('Error loading balance:', error);
    }
}

// Функция для загрузки данных кейса
async function loadCaseData() {
    try {
        // Получаем ID кейса из localStorage
        const caseId = localStorage.getItem('selectedCaseId');
        if (!caseId) {
            showNotification('Кейс не выбран');
            window.location.href = 'index.html';
            return;
        }
        
        // Загружаем данные кейса
        const { data: caseDataFromDB, error: caseError } = await supabase
            .from('cases')
            .select('*')
            .eq('id', caseId)
            .single();
        
        if (caseError || !caseDataFromDB) throw caseError || new Error('Кейс не найден');
        
        // Сохраняем данные кейса (используем другое имя переменной)
        caseData = caseDataFromDB;
        
        // Загружаем предметы кейса
        const { data: items, error: itemsError } = await supabase
            .from('case_items')
            .select(`
                id,
                chance,
                items (id, name, image_url, rarity, price, withdrawable)
            `)
            .eq('case_id', caseId)
            .order('chance', { ascending: false });
        
        if (itemsError) throw itemsError;
        
        // Сохраняем предметы кейса
        caseItems = items.map(item => ({
            ...item.items,
            chance: item.chance
        }));
        
        // Обновляем UI с данными кейса
        updateCaseUI();
        
        // Заполняем рулетку и возможные призы
        fillRoulette();
        fillPossiblePrizes();
        
    } catch (error) {
        console.error('Error loading case data:', error);
        showNotification('Ошибка загрузки кейса');
        window.location.href = 'index.html';
    }
}

// Функция для обновления UI с данными кейса
function updateCaseUI() {
    document.getElementById('case-title').textContent = caseData.name;
    document.getElementById('case-name').textContent = caseData.name;
    document.getElementById('case-description').textContent = caseData.description;
    document.getElementById('case-price-value').textContent = caseData.price;
    
    // Устанавливаем изображение кейса
    const caseImage = document.getElementById('case-image');
    if (caseData.image_url) {
        caseImage.src = caseData.image_url;
    } else {
        caseImage.src = 'https://via.placeholder.com/150';
    }
}

// Функция для заполнения рулетки
function fillRoulette() {
    const roulette = document.getElementById('roulette-wheel');
    roulette.innerHTML = '';
    
    // Создаем 50 элементов для плавной анимации
    for (let i = 0; i < 50; i++) {
        // Выбираем случайный предмет с учетом шансов
        const randomItem = getRandomItem();
        
        const itemElement = document.createElement('div');
        itemElement.className = 'roulette-item';
        itemElement.setAttribute('data-item-id', randomItem.id);
        itemElement.innerHTML = `
            <div class="roulette-icon">
                <img src="${randomItem.image_url}" alt="${randomItem.name}" style="width: 40px; height: 40px; object-fit: contain;">
            </div>
            <div class="roulette-value">${randomItem.name}</div>
        `;
        
        roulette.appendChild(itemElement);
    }
}

// Функция для заполнения возможных призов
async function fillPossiblePrizes() {
    const prizesGrid = document.getElementById('prizes-grid');
    prizesGrid.innerHTML = '<div class="loading-spinner"><i class="fas fa-spinner fa-spin"></i> Загрузка призов...</div>';

    try {
        // 1. Получаем ID выбранного кейса
        const caseId = localStorage.getItem('selectedCaseId');
        if (!caseId) {
            throw new Error('Кейс не выбран');
        }

        // 2. Загружаем предметы кейса
        const { data: caseItems, error } = await supabase
            .from('case_items')
            .select(`
                id,
                items!inner(
                    id,
                    name,
                    price,
                    image_url,
                    rarity
                )
            `)
            .eq('case_id', caseId);

        if (error) throw error;

        if (!caseItems || caseItems.length === 0) {
            prizesGrid.innerHTML = '<p class="no-prizes">В этом кейсе пока нет призов</p>';
            return;
        }

        // 3. Сортируем по возрастанию цены
        const sortedItems = [...caseItems].sort((a, b) => a.items.price - b.items.price);

        // 4. Очищаем контейнер и заполняем карточками
        prizesGrid.innerHTML = '';
        
        sortedItems.forEach(caseItem => {
            const item = caseItem.items;
            
            const prizeElement = document.createElement('div');
            prizeElement.className = `prize-item ${item.rarity || 'common'}`;
            
            prizeElement.innerHTML = `
                <div class="prize-icon-container">
                    <div class="prize-icon">
                        <img src="${item.image_url || 'https://via.placeholder.com/80'}" 
                             alt="${item.name}"
                             onerror="this.src='https://via.placeholder.com/80'">
                    </div>
                    <div class="prize-name">${item.name}</div>
                    <div class="prize-price-container">
                        <span class="prize-price">${item.price || '0'}</span>
                        <i class="fas fa-coins"></i>
                    </div>
                </div>
            `;

            prizesGrid.appendChild(prizeElement);
        });

    } catch (error) {
        console.error('Ошибка загрузки призов:', error);
        prizesGrid.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${error.message || 'Не удалось загрузить список призов'}</p>
                <button class="retry-btn" onclick="fillPossiblePrizes()">Повторить</button>
            </div>
        `;
    }
}

// Функция для получения случайного предмета с учетом шансов
function getRandomItem() {
    const totalChance = caseItems.reduce((sum, item) => sum + item.chance, 0);
    let random = Math.random() * totalChance;
    
    for (const item of caseItems) {
        if (random < item.chance) {
            return item;
        }
        random -= item.chance;
    }
    
    return caseItems[0];
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

// Функция для инициализации UI
function initUI() {
    // Устанавливаем активную кнопку количества
    document.querySelector('.open-option[data-count="1"]').classList.add('active');
}

// Добавьте новую функцию
function updateOpenButton() {
    const totalPrice = caseData.price * selectedCount;
    document.getElementById('open-count').textContent = selectedCount;
    document.getElementById('open-price').textContent = totalPrice;
}

// Функция для инициализации обработчиков событий
function initEventListeners() {
    // Кнопка "Назад"
    document.getElementById('back-btn').addEventListener('click', () => {
        window.location.href = 'index.html';
    });
    
    // Кнопки выбора количества
    const options = document.querySelectorAll('.open-option');
    const highlight = document.querySelector('.selector-highlight');
    
    options.forEach(btn => {
        btn.addEventListener('click', () => {
            options.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const index = Array.from(options).indexOf(btn);
            highlight.style.transform = `translateX(${index * 100}%)`;
            
            selectedCount = parseInt(btn.getAttribute('data-count'));
            updateOpenButton();
        });
    });
    
    // Кнопка открытия кейса
    document.getElementById('open-case-btn').addEventListener('click', openCase);
    
    // Кнопка информации о шансах
    document.getElementById('chance-info-btn').addEventListener('click', showChanceInfo);
    
    // Модальные окна
    document.getElementById('close-result-modal').addEventListener('click', () => {
        document.getElementById('result-modal').classList.remove('active');
    });
    
    document.getElementById('close-chance-modal').addEventListener('click', () => {
        document.getElementById('chance-modal').classList.remove('active');
    });
    
    // Кнопки в модальном окне результата
    document.getElementById('sell-item-btn').addEventListener('click', sellWonItem);
    document.getElementById('keep-item-btn').addEventListener('click', keepWonItem);
    document.getElementById('open-again-btn').addEventListener('click', openAgain);

    document.getElementById('demo-toggle').addEventListener('click', toggleDemoMode);
}

// Добавьте новую функцию
function toggleDemoMode() {
    const toggle = document.getElementById('demo-toggle');
    toggle.classList.toggle('active');
    const isDemo = toggle.classList.contains('active');
    
    // Здесь можно добавить логику для демо-режима
    if (isDemo) {
        showNotification('Демо-режим включен. Вы можете тестировать открытие кейсов без списания средств.');
    }
}

// Функция для открытия кейса
async function openCase() {
    if (!currentUser || !caseData) return;
    
    const openBtn = document.getElementById('open-case-btn');
    const totalPrice = caseData.price * selectedCount;
    const isDemo = document.getElementById('demo-toggle').classList.contains('active');
    
    // Проверяем баланс (если не демо-режим)
    if (!isDemo && userBalance < totalPrice) {
        showNotification('Недостаточно средств');
        return;
    }
    
    try {
        // Блокируем кнопку
        openBtn.disabled = true;
        
        // Добавляем класс открытия для анимации
        document.querySelector('.case-main').classList.add('case-opening');
        
        // Скрываем элементы
        document.getElementById('case-preview').classList.add('hidden');
        document.getElementById('open-options').classList.add('hidden');
        
        // Показываем статус обработки
        document.getElementById('processing-status').classList.add('visible');
        
        // Через 1 секунду показываем рулетку
        setTimeout(() => {
            document.querySelector('.case-main').classList.remove('case-opening');
            document.getElementById('processing-status').classList.remove('visible');
            
            const rouletteContainer = document.getElementById('roulette-container');
            rouletteContainer.style.display = 'block';
            setTimeout(() => {
                rouletteContainer.classList.add('visible');
                
                // Если не демо-режим, списываем средства
                if (!isDemo) {
                    deductBalance(totalPrice);
                }
                
                // Определяем выигранные предметы
                wonItems = [];
                for (let i = 0; i < selectedCount; i++) {
                    wonItems.push(getRandomItem());
                }
                
                // Запускаем анимацию рулетки
                startRouletteAnimation();
            }, 10);
        }, 1000);
        
    } catch (error) {
        console.error('Error opening case:', error);
        showNotification('Ошибка при открытии кейса');
        resetUI();
    }
}

// Добавьте новую функцию для списания баланса
async function deductBalance(amount) {
    try {
        const { error: balanceError } = await supabase
            .from('users')
            .update({ balance: userBalance - amount })
            .eq('id', currentUser.id);
        
        if (balanceError) throw balanceError;
        
        // Обновляем баланс в UI
        userBalance -= amount;
        document.getElementById('user-balance').textContent = userBalance;
        
        // Добавляем запись в историю операций
        await supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'case',
                amount: -amount,
                description: `Открытие кейса: ${caseData.name} (${selectedCount}x)`,
                created_at: new Date().toISOString()
            }]);
    } catch (error) {
        console.error('Error deducting balance:', error);
        throw error;
    }
}

// Обновленная функция для запуска анимации рулетки
function startRouletteAnimation() {
    const roulette = document.getElementById('roulette-wheel');
    const items = document.querySelectorAll('.roulette-item');
    const itemWidth = items[0].offsetWidth;
    
    // Определяем случайный предмет для остановки
    const stopIndex = Math.floor(Math.random() * (items.length - 10)) + 5;
    const stopPosition = -(stopIndex * itemWidth);
    
    // Сбрасываем анимацию
    roulette.style.transition = 'none';
    roulette.style.transform = 'translateX(0)';
    
    // Даем время на сброс
    setTimeout(() => {
        // Добавляем класс spinning для дополнительных эффектов
        roulette.classList.add('spinning');
        
        // Запускаем анимацию
        roulette.style.transition = 'transform 6s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
        roulette.style.transform = `translateX(${stopPosition}px)`;
        
        // Показываем результат после анимации
        setTimeout(() => {
            roulette.classList.remove('spinning');
            showResult(wonItems[0]);
        }, 6000);
    }, 10);
}

// Обновленная функция для показа результата
function showResult(item) {
    // Возвращаем видимость элементов
    resetUI();
    
    // Показываем модальное окно с результатом
    const resultModal = document.getElementById('result-modal');
    const itemImage = document.getElementById('won-item-image');
    const itemName = document.getElementById('won-item-name');
    const itemRarity = document.getElementById('won-item-rarity').querySelector('span');
    const itemPrice = document.getElementById('won-item-price');
    
    // Заполняем данные предмета
    itemImage.src = item.image_url;
    itemName.textContent = item.name;
    itemRarity.textContent = getRarityName(item.rarity);
    itemRarity.className = item.rarity;
    itemPrice.textContent = item.price;
    
    // Показываем модальное окно
    resultModal.classList.add('active');
}

function resetUI() {
    // Возвращаем видимость элементов (с проверкой на существование)
    const casePreview = document.getElementById('case-preview');
    const openOptions = document.querySelector('.open-options');
    const processingStatus = document.getElementById('processing-status');
    const rouletteContainer = document.getElementById('roulette-container');
    const openBtn = document.getElementById('open-case-btn');
    
    if (casePreview) casePreview.classList.remove('hidden');
    if (openOptions) openOptions.classList.remove('hidden');
    if (processingStatus) processingStatus.classList.remove('visible');
    
    // Скрываем рулетку
    if (rouletteContainer) {
        rouletteContainer.classList.remove('visible');
        setTimeout(() => {
            rouletteContainer.style.display = 'none';
        }, 300);
    }
    
    // Разблокируем кнопку открытия
    if (openBtn) {
        openBtn.disabled = false;
        openBtn.style.opacity = '1';
        openBtn.innerHTML = '<i class="fas fa-gift"></i> Открыть кейс';
    }
}

// Функция для продажи выигранного предмета
async function sellWonItem() {
    if (!currentUser || wonItems.length === 0) return;
    
    try {
        const item = wonItems[0];
        
        // Добавляем деньги на баланс
        const { error: balanceError } = await supabase
            .from('users')
            .update({ balance: userBalance + item.price })
            .eq('id', currentUser.id);
        
        if (balanceError) throw balanceError;
        
        // Обновляем баланс в UI
        userBalance += item.price;
        document.getElementById('user-balance').textContent = userBalance;
        
        // Добавляем запись в историю операций
        await supabase
            .from('transactions')
            .insert([{
                user_id: currentUser.id,
                type: 'sell',
                amount: item.price,
                description: `Продажа предмета: ${item.name}`,
                created_at: new Date().toISOString()
            }]);
        
        // Закрываем модальное окно
        document.getElementById('result-modal').classList.remove('active');
        
        showNotification(`Вы продали предмет за ${item.price} монет`);
        
    } catch (error) {
        console.error('Error selling item:', error);
        showNotification('Ошибка при продаже предмета');
    }
}

// Функция для сохранения выигранного предмета
async function keepWonItem() {
    if (!currentUser || wonItems.length === 0) return;
    
    try {
        const item = wonItems[0];
        
        // Добавляем предмет в инвентарь
        const { error: inventoryError } = await supabase
            .from('inventory')
            .insert([{
                user_id: currentUser.id,
                item_id: item.id,
                obtained_at: new Date().toISOString()
            }]);
        
        if (inventoryError) throw inventoryError;
        
        // Закрываем модальное окно
        document.getElementById('result-modal').classList.remove('active');
        
        showNotification(`Предмет "${item.name}" добавлен в инвентарь`);
        
    } catch (error) {
        console.error('Error keeping item:', error);
        showNotification('Ошибка при сохранении предмета');
    }
}

// Функция для открытия еще одного кейса
function openAgain() {
    // Закрываем модальное окно
    document.getElementById('result-modal').classList.remove('active');
    
    // Если есть еще выигранные предметы, показываем следующий
    if (wonItems.length > 1) {
        wonItems.shift();
        showResult(wonItems[0]);
    }
}

// Функция для показа информации о предмете
function showItemInfo(item) {
    const modal = document.getElementById('chance-modal');
    const content = document.getElementById('chance-info-content');
    
    content.innerHTML = `
        <div class="item-info">
            <div class="item-image-container">
                <img src="${item.image_url}" alt="${item.name}" style="max-width: 100%; max-height: 150px;">
                <div class="item-rarity ${item.rarity}">${getRarityName(item.rarity)}</div>
            </div>
            <h3>${item.name}</h3>
            <p>Шанс выпадения: <strong>${item.chance}%</strong></p>
            <p>Цена продажи: <strong>${item.price} <i class="fas fa-coins"></i></strong></p>
            ${item.withdrawable ? '<p><i class="fas fa-check-circle" style="color: #00b894;"></i> Можно вывести</p>' : ''}
        </div>
    `;
    
    modal.classList.add('active');
}

// Функция для показа информации о шансах
function showChanceInfo() {
    const modal = document.getElementById('chance-modal');
    const content = document.getElementById('chance-info-content');
    
    // Группируем предметы по редкости
    const itemsByRarity = {};
    caseItems.forEach(item => {
        if (!itemsByRarity[item.rarity]) {
            itemsByRarity[item.rarity] = {
                count: 0,
                totalChance: 0,
                items: []
            };
        }
        itemsByRarity[item.rarity].count++;
        itemsByRarity[item.rarity].totalChance += item.chance;
        itemsByRarity[item.rarity].items.push(item);
    });
    
    // Сортируем по редкости (от легендарных к обычным)
    const sortedRarities = Object.entries(itemsByRarity).sort((a, b) => {
        const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
        return rarityOrder.indexOf(a[0]) - rarityOrder.indexOf(b[0]);
    });
    
    // Формируем контент
    let html = '<h3>Шансы по редкостям:</h3>';
    
    sortedRarities.forEach(([rarity, data]) => {
        html += `
            <div class="chance-item">
                <div class="chance-rarity ${rarity}">${getRarityName(rarity)}</div>
                <div class="chance-value">${data.totalChance.toFixed(2)}%</div>
                <div class="chance-count">${data.count} предметов</div>
            </div>
        `;
    });
    
    content.innerHTML = html;
    modal.classList.add('active');
}

// Функция для показа уведомлений
function showNotification(message) {
    // Можно использовать Telegram WebApp для показа уведомлений
    if (window.Telegram?.WebApp?.showAlert) {
        window.Telegram.WebApp.showAlert(message);
    } else {
        // Fallback для браузера
        alert(message);
    }
}