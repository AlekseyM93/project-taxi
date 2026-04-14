import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-8">
            Политика <span className="gold-text">конфиденциальности</span>
          </h1>

          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
            <p className="text-sm">Последнее обновление: {new Date().toLocaleDateString('ru-RU')}</p>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">1. Общие положения</h2>
              <p>Настоящая Политика конфиденциальности определяет порядок обработки и защиты персональных данных пользователей сервиса «Такси Свои» (далее — Сервис).</p>
              <p>Используя Сервис, вы соглашаетесь с условиями данной Политики конфиденциальности. Если вы не согласны с условиями, пожалуйста, не используйте Сервис.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">2. Собираемые данные</h2>
              <p>Мы можем собирать следующие персональные данные:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Имя и фамилия</li>
                <li>Номер телефона</li>
                <li>Адреса отправления и назначения</li>
                <li>Дата и время поездки</li>
                <li>Данные о местоположении (при использовании геолокации)</li>
                <li>История заказов</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">3. Цели обработки данных</h2>
              <p>Персональные данные обрабатываются для:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Предоставления услуг такси и доставки</li>
                <li>Связи с пользователем по вопросам обслуживания</li>
                <li>Улучшения качества сервиса</li>
                <li>Выполнения обязательств перед пользователем</li>
                <li>Соблюдения требований законодательства РФ</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">4. Защита данных</h2>
              <p>Мы принимаем все необходимые организационные и технические меры для защиты персональных данных от несанкционированного доступа, изменения, раскрытия или уничтожения.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">5. Передача данных третьим лицам</h2>
              <p>Мы не передаём персональные данные третьим лицам, за исключением случаев, предусмотренных законодательством РФ, а также для исполнения обязательств перед пользователем (например, передача данных водителю для выполнения заказа).</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">6. Права пользователя</h2>
              <p>Вы имеете право:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Запросить информацию о хранящихся персональных данных</li>
                <li>Потребовать исправления неточных данных</li>
                <li>Потребовать удаления персональных данных</li>
                <li>Отозвать согласие на обработку данных</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">7. Контактная информация</h2>
              <p>По всем вопросам, связанным с обработкой персональных данных, вы можете обратиться по телефону +7 (900) 123-45-67 или электронной почте info@taxisvoi.ru.</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Privacy;
