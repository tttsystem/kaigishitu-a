import React, { useState, useEffect } from 'react';

const NotionBookingSystem = () => {
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookingData, setBookingData] = useState({});
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  
  // Notionからカレンダーデータを取得
  const [notionEvents, setNotionEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // システム設定（コードで直接変更）
  const settings = {
    immediateButtonText: '今すぐ予約する',
    startHour: 11,
    endHour: 21,
    systemTitle: '予約システム',
    description: 'ご希望の日時を選択してください'
  };

  // 祝日リスト（2025年の日本の祝日）
  const holidays2025 = [
    '2025-01-01', // 元日
    '2025-01-13', // 成人の日
    '2025-02-11', // 建国記念の日
    '2025-02-23', // 天皇誕生日
    '2025-03-20', // 春分の日
    '2025-04-29', // 昭和の日
    '2025-05-03', // 憲法記念日
    '2025-05-04', // みどりの日
    '2025-05-05', // こどもの日
    '2025-07-21', // 海の日
    '2025-08-11', // 山の日
    '2025-09-15', // 敬老の日
    '2025-09-23', // 秋分の日
    '2025-10-13', // スポーツの日
    '2025-11-03', // 文化の日
    '2025-11-23', // 勤労感謝の日
  ];

  // Notion API設定
  const CALENDAR_DATABASE_ID = process.env.REACT_APP_NOTION_DATABASE_ID || '1fa44ae2d2c780a5b27dc7aae5bae1aa';

  // 平日のみの週の日付を生成（土日を除外）
  const getCurrentWeekDates = () => {
    const today = new Date();
    const currentDay = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - currentDay + 1 + (weekOffset * 7));
    
    const weekDates = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  // 祝日かどうかをチェック
  const isHoliday = (date) => {
    const dateString = date.toISOString().split('T')[0];
    return holidays2025.includes(dateString);
  };

  // 時間スロットを生成（1時間ごと）
  const generateTimeSlots = (startHour, endHour) => {
    const slots = [];
    for (let hour = startHour; hour < endHour; hour++) {
      const time = `${hour.toString().padStart(2, '0')}:00`;
      slots.push(time);
    }
    return slots;
  };

  // 設定に基づいて時間帯を分割
  const getTimeSlots = () => {
    const totalHours = settings.endHour - settings.startHour;
    const hoursPerSlot = Math.ceil(totalHours / 3);
    
    const slot1End = Math.min(settings.startHour + hoursPerSlot, settings.endHour);
    const slot2End = Math.min(slot1End + hoursPerSlot, settings.endHour);
    
    return {
      morning: generateTimeSlots(settings.startHour, slot1End),
      afternoon: generateTimeSlots(slot1End, slot2End),
      evening: generateTimeSlots(slot2End, settings.endHour)
    };
  };

  const weekDates = getCurrentWeekDates();
  const timeSlots = getTimeSlots();

  // Notionからカレンダーイベントを取得
  const fetchNotionCalendar = async () => {
    try {
      setIsLoading(true);
      
      // Netlify Functionsを使用
      const response = await fetch('/.netlify/functions/notion-query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          databaseId: CALENDAR_DATABASE_ID,
          filter: {
            property: '予定日',
            date: {
              on_or_after: weekDates[0].toISOString().split('T')[0],
              on_or_before: weekDates[4].toISOString().split('T')[0]
            }
          }
        })
      });

      if (!response.ok) {
        throw new Error('Notion APIエラー');
      }

      const data = await response.json();
      setNotionEvents(data.results || []);

    } catch (error) {
      console.error('Notionカレンダーの取得に失敗:', error);
      setNotionEvents([]);
    } finally {
      setIsLoading(false);
    }
  };

  // Notionに新しい予約を追加
  const createNotionEvent = async (bookingData) => {
    try {
      // Netlify Functionsを使用
      const response = await fetch('/.netlify/functions/notion-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: CALENDAR_DATABASE_ID },
          properties: {
            '名前': {
              title: [
                {
                  text: {
                    content: bookingData.customerName
                  }
                }
              ]
            },
            '予定日': {
              date: {
                start: `${bookingData.date}T${bookingData.time}:00+09:00`,
                end: `${bookingData.date}T${String(parseInt(bookingData.time.split(':')[0]) + 1).padStart(2, '0')}:00+09:00`
              }
            }
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.text();
        console.error('Notion APIエラー詳細:', errorData);
        throw new Error('Notion APIエラー');
      }

      const result = await response.json();
      console.log('Notionに予約を作成:', result);
      return true;
    } catch (error) {
      console.error('Notion予約作成エラー:', error);
      return false;
    }
  };

  // コンポーネント読み込み時と週変更時にNotionカレンダーを取得
  useEffect(() => {
  if (weekDates && weekDates.length > 0) {
    fetchNotionCalendar();
  }
  }, [weekOffset]);

  // Notionのイベントと照合して予約状況を確認
  const getBookingStatus = (date, time) => {
    // 祝日の場合は予約不可
    if (isHoliday(date)) {
      return 'holiday';
    }
    
    const targetDateTime = `${date.toISOString().split('T')[0]}T${time}:00`;
    
    // Notionのイベントをチェック
    const hasNotionEvent = notionEvents.some(event => {
      const eventStart = event.properties['予定日']?.date?.start;
      if (!eventStart) return false;
      
      const eventDate = new Date(eventStart);
      const targetDate = new Date(targetDateTime);
      
      return eventDate.getTime() === targetDate.getTime();
    });
    
    if (hasNotionEvent) return 'booked';
    
    // ローカルの予約データもチェック
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${time}`;
    return bookingData[key] || 'available';
  };

  const handleTimeSlotClick = (date, time) => {
    const status = getBookingStatus(date, time);
    if (status === 'available') {
      setSelectedDate(date);
      setSelectedTime(time);
      setShowBookingForm(true);
    }
  };

  const handleBooking = async () => {
    setIsLoading(true);
    
    try {
      const bookingDataObj = {
        date: selectedDate.toISOString().split('T')[0],
        time: selectedTime,
        customerName: customerName
      };
      
      const success = await createNotionEvent(bookingDataObj);
      
      if (success) {
        // ローカルの予約データを更新
        const bookingKey = `${selectedDate.getFullYear()}-${selectedDate.getMonth()}-${selectedDate.getDate()}-${selectedTime}`;
        setBookingData(prev => ({
          ...prev,
          [bookingKey]: 'booked'
        }));
        
        // フォームをリセット
        setShowBookingForm(false);
        setSelectedDate(null);
        setSelectedTime(null);
        setCustomerName('');
        
        alert('予約が完了しました！');
        
        // Notionカレンダーを再取得して最新状態に更新
        await fetchNotionCalendar();
      } else {
        alert('予約の作成に失敗しました。もう一度お試しください。');
      }
    } catch (error) {
      console.error('予約エラー:', error);
      alert('予約の作成に失敗しました。もう一度お試しください。');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  const getDayName = (date) => {
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    return days[date.getDay()];
  };

  const getSlotColor = (date, time) => {
    const status = getBookingStatus(date, time);
    if (status === 'booked' || status === 'holiday') return 'bg-gray-300 cursor-not-allowed';
    if (selectedDate && selectedTime && 
        selectedDate.toDateString() === date.toDateString() && 
        selectedTime === time) {
      return 'bg-blue-500 text-white';
    }
    return 'bg-teal-100 hover:bg-teal-200 cursor-pointer';
  };

  return (
    <div className="max-w-4xl mx-auto p-4 bg-white min-h-screen">
      {/* ヘッダー部分 */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">{settings.systemTitle}</h1>
        <p className="text-gray-600">{settings.description}</p>
      </div>

      {/* メインアクションボタン */}
      <button 
        className="w-full bg-blue-500 text-white py-4 px-6 rounded-xl mb-8 font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50 shadow-lg"
        disabled={isLoading}
      >
        {isLoading ? '読み込み中...' : settings.immediateButtonText}
      </button>

      {/* 週選択 */}
      <div className="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-lg">
        <button 
          onClick={() => setWeekOffset(weekOffset - 1)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
        >
          ← 前週
        </button>
        <span className="font-semibold text-lg">
          {weekDates && weekDates.length > 0 ? `${formatDate(weekDates[0])} - ${formatDate(weekDates[4])}` : '読み込み中...'}
        </span>
        <button 
          onClick={() => setWeekOffset(weekOffset + 1)}
          className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 shadow-sm"
        >
          翌週 →
        </button>
      </div>

      {/* 時間帯表示 */}
      <div className="flex justify-center space-x-6 mb-6">
        {timeSlots.morning.length > 0 && (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
            <span className="text-sm font-medium">前半 {settings.startHour}:00~</span>
          </div>
        )}
        {timeSlots.afternoon.length > 0 && (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-orange-500 rounded-full"></div>
            <span className="text-sm font-medium">中盤</span>
          </div>
        )}
        {timeSlots.evening.length > 0 && (
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-purple-500 rounded-full"></div>
            <span className="text-sm font-medium">後半</span>
          </div>
        )}
      </div>

      {/* カレンダーグリッド */}
      <div className="border-2 border-gray-200 rounded-xl overflow-hidden shadow-lg">
        {/* ヘッダー */}
        <div className="grid grid-cols-6 bg-gray-100 border-b-2 border-gray-200">
          <div className="p-4 text-center font-bold text-gray-700">時間</div>
          {weekDates.map((date, index) => (
            <div key={index} className="p-4 text-center border-l border-gray-200">
              <div className="font-bold text-gray-800">{formatDate(date)}</div>
              <div className="text-sm text-gray-600">
                ({getDayName(date)})
                {isHoliday(date) && <span className="text-red-500 block text-xs">祝日</span>}
              </div>
            </div>
          ))}
        </div>

        {/* 前半の時間帯 */}
        {timeSlots.morning.length > 0 && (
          <div className="bg-blue-25">
            {timeSlots.morning.map((time) => (
              <div key={time} className="grid grid-cols-6 border-b border-gray-200">
                <div className="p-4 text-center font-semibold bg-blue-50 border-l-4 border-blue-500">{time}</div>
                {weekDates.map((date, dateIndex) => (
                  <div key={dateIndex} className="p-4 text-center border-l border-gray-200">
                    <div 
                      className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center font-bold text-lg ${getSlotColor(date, time)} transition-all`}
                      onClick={() => handleTimeSlotClick(date, time)}
                    >
                      {getBookingStatus(date, time) === 'available' ? '○' : '×'}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 中盤の時間帯 */}
        {timeSlots.afternoon.length > 0 && (
          <div className="bg-orange-25">
            {timeSlots.afternoon.map((time) => (
              <div key={time} className="grid grid-cols-6 border-b border-gray-200">
                <div className="p-4 text-center font-semibold bg-orange-50 border-l-4 border-orange-500">{time}</div>
                {weekDates.map((date, dateIndex) => (
                  <div key={dateIndex} className="p-4 text-center border-l border-gray-200">
                    <div 
                      className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center font-bold text-lg ${getSlotColor(date, time)} transition-all`}
                      onClick={() => handleTimeSlotClick(date, time)}
                    >
                      {getBookingStatus(date, time) === 'available' ? '○' : '×'}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* 後半の時間帯 */}
        {timeSlots.evening.length > 0 && (
          <div className="bg-purple-25">
            {timeSlots.evening.map((time) => (
              <div key={time} className="grid grid-cols-6 border-b border-gray-200">
                <div className="p-4 text-center font-semibold bg-purple-50 border-l-4 border-purple-500">{time}</div>
                {weekDates.map((date, dateIndex) => (
                  <div key={dateIndex} className="p-4 text-center border-l border-gray-200">
                    <div 
                      className={`w-10 h-10 rounded-full mx-auto flex items-center justify-center font-bold text-lg ${getSlotColor(date, time)} transition-all`}
                      onClick={() => handleTimeSlotClick(date, time)}
                    >
                      {getBookingStatus(date, time) === 'available' ? '○' : '×'}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 顧客用予約フォーム - シンプル版 */}
      {showBookingForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h3 className="text-2xl font-bold text-center mb-6 text-gray-800">予約確認</h3>
            
            <div className="mb-6 p-4 bg-blue-50 rounded-lg">
              <p className="text-center text-lg font-semibold text-blue-800">
                📅 {selectedDate && formatDate(selectedDate)} {selectedTime}
              </p>
            </div>

            <div className="mb-6">
              <label className="block text-lg font-semibold mb-3 text-gray-700">お名前 *</label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full p-4 border-2 border-gray-300 rounded-lg text-lg focus:border-blue-500 focus:outline-none"
                placeholder="お名前を入力してください"
                required
              />
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => setShowBookingForm(false)}
                className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-semibold"
              >
                キャンセル
              </button>
              <button
                onClick={handleBooking}
                disabled={!customerName.trim() || isLoading}
                className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold"
              >
                {isLoading ? '予約中...' : '予約確定'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 使い方説明 */}
      <div className="mt-8 p-6 bg-gray-50 rounded-xl">
        <h3 className="font-bold mb-4 text-lg text-gray-800">📋 予約方法</h3>
        <ul className="text-gray-600 space-y-2">
          <li className="flex items-center"><span className="text-green-500 mr-2">○</span>予約可能な時間帯です</li>
          <li className="flex items-center"><span className="text-red-500 mr-2">×</span>既に予約済みまたは祝日です</li>
          <li className="flex items-center"><span className="text-blue-500 mr-2">📱</span>予約可能な時間帯をタップして予約してください</li>
          <li className="flex items-center"><span className="text-purple-500 mr-2">⏰</span>予約は1時間単位です（平日のみ）</li>
        </ul>
      </div>
    </div>
  );
};

export default NotionBookingSystem;