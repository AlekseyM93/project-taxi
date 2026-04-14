import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Offer = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-3xl">
          <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-8">
            Публичная <span className="gold-text">оферта</span>
          </h1>

          <div className="prose prose-invert max-w-none space-y-6 text-muted-foreground">
            <p className="text-sm">Последнее обновление: {new Date().toLocaleDateString('ru-RU')}</p>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">1. Общие положения</h2>
              <p>Настоящий документ является публичной офертой (далее — Оферта) сервиса «Такси Свои» (далее — Исполнитель) и содержит условия предоставления услуг по перевозке пассажиров и доставке грузов.</p>
              <p>Оформление заказа через сайт, по телефону или в мобильном приложении является акцептом настоящей Оферты.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">2. Предмет оферты</h2>
              <p>Исполнитель обязуется оказать Заказчику услуги по:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Перевозке пассажиров легковым автотранспортом</li>
                <li>Доставке цветов и цветочных композиций</li>
                <li>Доставке иных грузов по согласованию</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">3. Стоимость услуг</h2>
              <p>Стоимость услуг определяется в соответствии с действующим прайс-листом, размещённым на сайте Исполнителя. Цены фиксированы и не изменяются после подтверждения заказа.</p>
              <p>При использовании платных дорог стоимость может быть увеличена на 15% от базового тарифа.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">4. Порядок оказания услуг</h2>
              <ul className="list-disc pl-6 space-y-2">
                <li>Заказчик оформляет заявку через сайт или по телефону</li>
                <li>Исполнитель подтверждает заказ и назначает водителя</li>
                <li>Водитель прибывает в указанное место и время</li>
                <li>Оплата производится по завершении поездки</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">5. Права и обязанности сторон</h2>
              <p><strong className="text-foreground">Исполнитель обязуется:</strong></p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Обеспечить подачу автомобиля в согласованное время</li>
                <li>Обеспечить безопасность перевозки</li>
                <li>Соблюдать правила дорожного движения</li>
              </ul>
              <p><strong className="text-foreground">Заказчик обязуется:</strong></p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Предоставить точный адрес и контактные данные</li>
                <li>Быть готовым к подаче автомобиля</li>
                <li>Произвести оплату в полном объёме</li>
              </ul>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">6. Ответственность</h2>
              <p>Исполнитель несёт ответственность за сохранность грузов во время перевозки. В случае повреждения или утраты груза по вине Исполнителя, возмещение производится в полном объёме.</p>
            </section>

            <section className="space-y-4">
              <h2 className="text-xl font-semibold text-foreground">7. Контактная информация</h2>
              <p>ИП «Такси Свои»</p>
              <p>Адрес: г. Ступино, Московская область</p>
              <p>Телефон: +7 (900) 123-45-67</p>
              <p>Email: info@taxisvoi.ru</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Offer;
